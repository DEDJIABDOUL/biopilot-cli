// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Files offered for a value of a format (spec §8.2), as a custom Fig generator: the engine's own
// generator mechanism, no engine change. From the project: files of the expected formats (all files when
// none match) and folders; the mate of a typed R1 first, then files of the value's read role; reference
// indexes as one prefix or folder; for a derived output, the name derived from its source's value.

import fs from "node:fs";
import path from "node:path";
import type { Catalog, ValueSpec } from "../knowledge/catalog.js";
import { detectProject, mateOf, readNumber, type Project } from "../project/detect.js";

/** What a value's generator knows beyond its ValueSpec: the option's names and its relations on the line. */
export type FileValueContext = {
  /** Names of the option taking the value; empty for a positional argument. */
  ownNames: readonly string[];
  /** Every name of an option of the command, by canonical name. */
  namesOf: (canonicalName: string) => readonly string[];
  /** Canonical name of the mate option, when the value is one of a read pair. */
  mate: string | null;
  derive: { from: string; suffix: string } | null;
};

// Above every Rank (0–100): when a file of the expected format exists, it is what the user wants next.
const DERIVED_PRIORITY = 104;
const MATE_PRIORITY = 103;
const PREFERRED_PRIORITY = 102;
const FORMAT_PRIORITY = 101;
/** Folders, for navigating: below the options of a positional argument's command. */
const FOLDER_PRIORITY = 56;
/** No file of the format: every file, as the engine's own file template does. */
const ANY_FILE_PRIORITY = 55;

const toPosix = (file: string) => file.split(path.sep).join("/");

/**
 * The shell's folder and the folder being listed. The engine hands the generator the folder it resolved
 * from the token being typed (`data/` → …/data) but not whether the last token is being typed: it is,
 * when it names a folder and the resolved folder ends with it.
 */
const folders = (tokens: readonly string[], resolvedCwd: string): { shell: string | undefined; listing: string; typedDir: boolean } => {
  const resolved = path.normalize(resolvedCwd).replace(/(.)[/\\]+$/, "$1"); // the engine may keep a trailing separator
  const last = tokens.at(-1) ?? "";
  const dir = last.endsWith("/") ? last : path.posix.dirname(last);
  if (!last.includes("/") || dir === ".") return { shell: resolved, listing: resolved, typedDir: false };
  const normalized = path.normalize(dir).replace(/[/\\]+$/, "");
  if (path.isAbsolute(dir))
    return { shell: path.normalize(resolved) === normalized ? undefined : resolved, listing: resolved, typedDir: path.normalize(resolved) === normalized };
  if (!resolved.endsWith(path.sep + normalized)) return { shell: resolved, listing: resolved, typedDir: false };
  return { shell: resolved.slice(0, resolved.length - normalized.length - 1), listing: resolved, typedDir: true };
};

/** The value given on the line to one of these option names (`--in1 x` or `--in1=x`), the latest one. */
const valueOf = (tokens: readonly string[], names: readonly string[]): string | undefined => {
  let found: string | undefined;
  // The last token is the one being completed: never a value already given.
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (names.includes(token) && i + 1 < tokens.length - 1) found = tokens[i + 1];
    const equals = token.indexOf("=");
    if (equals > 0 && names.includes(token.slice(0, equals))) found = token.slice(equals + 1);
  }
  return found;
};

/** `ctrl_R1.fastq.gz` + `.trimmed` → `ctrl_R1.trimmed.fastq.gz`: the suffix goes before the format's extension. */
const deriveName = (file: string, suffix: string, catalog: Catalog): string => {
  const base = path.posix.basename(file);
  const pattern = catalog.formatOfFile(base)?.pattern;
  let match: RegExpExecArray | null = null;
  try {
    match = pattern ? new RegExp(pattern, "i").exec(base) : null;
  } catch {
    match = null;
  }
  const cut = match ? match.index : base.lastIndexOf(".") > 0 ? base.lastIndexOf(".") : base.length;
  return `${base.slice(0, cut)}${suffix}${base.slice(cut)}`;
};

type Candidate = { name: string; type: "file" | "folder"; file: string; readNumber: 1 | 2 | undefined };

/** The candidates: from the project when no folder is typed (relative to the shell's folder), else the listed folder. */
const candidates = (
  project: Project,
  shell: string,
  listing: string,
  typedDir: boolean,
  value: ValueSpec,
  catalog: Catalog,
): { matching: Candidate[]; folders: Candidate[]; others: Candidate[] } => {
  let files: string[];
  let dirs: string[];
  if (typedDir) {
    files = [];
    dirs = [];
    try {
      for (const entry of fs.readdirSync(listing, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        (entry.isDirectory() ? dirs : files).push(entry.name);
      }
    } catch {
      // unreadable: nothing to offer
    }
  } else {
    // Project files under the shell's folder, relative to it; folders right under it, to navigate.
    const prefix = toPosix(path.relative(project.root, shell));
    const under = (file: string) => (prefix === "" ? file : file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : undefined);
    files = project.files.map(under).filter((file): file is string => file !== undefined);
    dirs = project.folders.map(under).filter((dir): dir is string => dir !== undefined && !dir.includes("/"));
    try {
      // Folders the walk skipped (hidden, depth) are still there to navigate into.
      for (const entry of fs.readdirSync(shell, { withFileTypes: true }))
        if (entry.isDirectory() && !dirs.includes(entry.name) && !entry.name.startsWith(".")) dirs.push(entry.name);
    } catch {
      // unreadable
    }
  }
  const absolute = (name: string) => path.join(typedDir ? listing : shell, name);
  const wanted = new Set(value.formats);
  const matching: Candidate[] = [];
  if (value.type === "file")
    for (const file of files)
      if (wanted.has(catalog.formatOfFile(file)?.name ?? "")) matching.push({ name: file, type: "file", file: absolute(file), readNumber: readNumber(file) });
  for (const index of catalog.matchFiles(files)) {
    if (!wanted.has(index.format)) continue;
    const kind = catalog.listFormats().find((format) => format.name === index.format)?.kind;
    if ((kind === "dir") === (value.type === "dir"))
      matching.push({ name: index.path, type: kind === "dir" ? "folder" : "file", file: absolute(index.path), readNumber: undefined });
  }
  return {
    matching,
    folders: dirs.map((dir) => ({ name: dir, type: "folder", file: absolute(dir), readNumber: undefined })),
    others: files.map((file) => ({ name: file, type: "file", file: absolute(file), readNumber: undefined })),
  };
};

/** The generator of a value taking a file (or folder) of one of `value.formats`. Never throws. */
export const fileGenerator = (value: ValueSpec, context: FileValueContext, getCatalog: () => Catalog | null): Fig.Generator => ({
  custom: async (tokens, _executeShellCommand, generatorContext) => {
    const catalog = getCatalog();
    if (!catalog) return [];
    try {
      const { shell, listing, typedDir } = folders(tokens, generatorContext.currentWorkingDirectory);
      const project = detectProject(shell ?? listing, catalog);
      const { matching, folders: dirs, others } = candidates(project, shell ?? listing, listing, typedDir, value, catalog);
      const relative = (file: string) => toPosix(path.relative(typedDir ? listing : (shell ?? listing), file));
      const inListing = (file: string) => !relative(file).startsWith("..") && (!typedDir || !relative(file).includes("/"));
      const suggestions: Fig.Suggestion[] = [];

      if (context.derive && shell) {
        const source = valueOf(tokens, context.namesOf(context.derive.from));
        if (source) {
          const input = path.resolve(shell, source);
          const resultsDir = path.resolve(project.root, project.config?.resultsDir ?? "results");
          const folder = fs.existsSync(resultsDir) ? resultsDir : path.dirname(input);
          const derived = path.join(folder, deriveName(input, context.derive.suffix, catalog));
          if (inListing(derived)) suggestions.push({ name: relative(derived), type: "file", priority: DERIVED_PRIORITY });
        }
      }
      if (matching.length === 0) {
        return [
          ...suggestions,
          // A folder value never falls back to files.
          ...(value.type === "dir" ? [] : others.map((candidate) => ({ name: candidate.name, type: "file" as const, priority: ANY_FILE_PRIORITY }))),
          ...dirs.map((candidate) => ({ name: candidate.name, type: "folder" as const, priority: ANY_FILE_PRIORITY })),
        ];
      }

      const mateValue = context.mate && shell ? valueOf(tokens, context.namesOf(context.mate)) : undefined;
      const mateFile = mateValue ? mateOf(path.resolve(shell ?? listing, mateValue)) : undefined;
      // The value's own read role: the one opposite to its mate's, or the one declared.
      const role = mateValue ? (readNumber(mateValue) === 1 ? 2 : readNumber(mateValue) === 2 ? 1 : value.readRole) : value.readRole;
      // The project's reference (.biopilot.toml) leads wherever it fits the value.
      const reference = project.config?.reference ? path.resolve(project.root, project.config.reference) : undefined;
      for (const candidate of matching) {
        const priority =
          candidate.file === mateFile || candidate.file === reference
            ? MATE_PRIORITY
            : role !== null && candidate.readNumber === role
              ? PREFERRED_PRIORITY
              : FORMAT_PRIORITY;
        suggestions.push({ name: candidate.name, type: candidate.type, priority });
      }
      return [...suggestions, ...dirs.map((candidate) => ({ name: candidate.name, type: "folder" as const, priority: FOLDER_PRIORITY }))];
    } catch {
      return [];
    }
  },
});
