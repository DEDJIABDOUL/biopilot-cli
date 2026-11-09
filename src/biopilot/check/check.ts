// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Warnings about a command line before it runs (`biopilot check`, ticket #109). The line is read with
// the Catalog: its tool, subcommands, options and arguments. Rules look at file names, at whether files
// exist, and at the CPUs available; never at the content of a file. Never throws: what cannot be read
// gives no Warning.

import path from "node:path";
import type { Argument, Catalog, Command, Format, Option, ValueSpec } from "../knowledge/catalog.js";
import { withinVersions } from "../env/versionOrder.js";
import type { HelpOption } from "../profile/helpParser.js";
import { mateName, readNumber, sampleOf } from "../project/detect.js";
import type { AvailableCpus } from "./cpus.js";
import { tokenize, type Words } from "./tokens.js";

export const RULES = [
  "read-pair",
  "output-is-input",
  "output-folder-missing",
  "input-missing",
  "reference-index",
  "threads-above-cpus",
  "option-version",
  "option-deprecated",
] as const;
export type RuleId = (typeof RULES)[number];

/** A finding about a command line: what is wrong, on which options or arguments. */
export type Warning = {
  rule: RuleId;
  severity: "warning" | "info";
  tool: string;
  /** Subcommand path. */
  command: string[];
  /** The options (as typed) and arguments (`<name>`) involved. */
  subjects: string[];
  message: string;
};

export type CheckContext = {
  cwd: string;
  home: string | undefined;
  exists: (file: string) => boolean;
  isDirectory: (file: string) => boolean;
  /** Names of the entries of a folder; empty when it cannot be read. */
  list: (dir: string) => string[];
  cpus: AvailableCpus;
  /**
   * What is installed of a Tool: its version when known, and the Profile of one of its commands (by
   * subcommand path, `""` for the root) when it was read. Nothing when the Tool is not installed or not known.
   */
  installed?: (tool: string) => Installed | undefined;
};

export type Installed = { version: string | undefined; profile: (command: string) => HelpOption[] | undefined };

/** An option name typed on the line, and the Catalog's option when it knows it. */
type Typed = { name: string; option: Option | undefined };

export type CheckResult = { ok: true; analysed: { tool: string; command: string[] }[]; warnings: Warning[] } | { ok: false; reason: string };

/** A value given on the line to an option or argument the Catalog describes. */
type Bound = {
  /** As typed: `--in1`, or `<in1.fq>` for a positional argument. */
  subject: string;
  /** Canonical name of the option, or name of the argument: how mates refer to each other. */
  key: string;
  spec: ValueSpec;
  values: string[];
  mate: string | null;
  threads: boolean;
};

/** Values that are not paths BioPilot can check: standard streams, URIs, patterns, variables. */
const notAPath = (value: string) =>
  value === "" ||
  value === "-" ||
  /^\/dev\/(stdin|stdout|stderr|null)$/.test(value) ||
  value.includes("://") ||
  /[*?[\]{}$`]/.test(value) ||
  value.startsWith("<(");

const argName = (argument: Argument) => `<${argument.name}>`;

/** A command's options by alias and its arguments, read once per Catalog: the live check runs on every keystroke. */
const shapes = new WeakMap<Catalog, Map<string, { byAlias: Map<string, Option>; args: Argument[] }>>();
const commandShape = (catalog: Catalog, command: Command) => {
  let byCommand = shapes.get(catalog);
  if (!byCommand) shapes.set(catalog, (byCommand = new Map()));
  const key = [command.tool, ...command.path].join("\0");
  let shape = byCommand.get(key);
  if (!shape) {
    const options = catalog.listOptions(command);
    shape = { byAlias: new Map(options.flatMap((option) => option.aliases.map((alias) => [alias, option] as const))), args: catalog.listArguments(command) };
    byCommand.set(key, shape);
  }
  return shape;
};

/** Reads the words of one simple command against the Catalog: its command, then options and arguments with their values. */
const bind = (catalog: Catalog, words: Words): { command: Command; bound: Bound[]; typed: Typed[] } | undefined => {
  // `VAR=value tool …`
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (i >= words.length) return;
  const toolName = path.posix.basename(words[i]);
  const tool = catalog.getTool(toolName);
  let command = tool ? catalog.getCommand(tool.name) : undefined;
  if (!tool || !command) return;
  i++;
  for (; i < words.length && !words[i].startsWith("-"); i++) {
    const sub = catalog.getCommand(tool.name, [...command.path, words[i]]);
    if (!sub) break;
    command = sub;
  }
  const { byAlias, args } = commandShape(catalog, command);
  const bound: Bound[] = [];
  const typed: Typed[] = [];
  const add = (subject: string, key: string, spec: ValueSpec | null, values: string[], mate: string | null, threads: boolean) => {
    if (!spec || values.length === 0) return;
    const existing = bound.find((b) => b.key === key && b.subject === subject);
    if (existing) existing.values.push(...values);
    else bound.push({ subject, key, spec, values, mate, threads });
  };
  let position = 0;
  let positionalOnly = false;
  /**
   * After an option the Catalog doesn't know, whether the next word is its value is unknown: arguments
   * are no longer read, so that no word is taken for a file it is not. Options still are.
   */
  let argumentsUnknown = false;
  for (; i < words.length; i++) {
    const word = words[i];
    if (!positionalOnly && word === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && word.startsWith("-") && word.length > 1) {
      const equals = word.indexOf("=");
      const name = equals > 0 ? word.slice(0, equals) : word;
      const option = byAlias.get(name);
      if (!option && /^-[^-]/.test(word) && equals < 0) {
        // Grouped short options and attached values: `-ax map-ont`, `-t8`.
        let read = true;
        const letters: Typed[] = [];
        for (let k = 1; k < word.length; k++) {
          const short = byAlias.get(`-${word[k]}`);
          if (!short) {
            read = false;
            break;
          }
          letters.push({ name: `-${word[k]}`, option: short });
          if (short.value) {
            const rest = word.slice(k + 1);
            if (rest !== "") add(`-${word[k]}`, short.canonicalName, short.value, [rest], short.mate, short.threads);
            else if (i + 1 < words.length) add(`-${word[k]}`, short.canonicalName, short.value, [words[++i]], short.mate, short.threads);
            break; // the rest of the word, or the next word, was its value
          }
        }
        if (!read) argumentsUnknown = true;
        typed.push(...(read ? letters : [{ name: word, option: undefined }]));
        continue;
      }
      typed.push({ name, option });
      if (!option) {
        if (equals < 0) argumentsUnknown = true;
        continue;
      }
      if (!option.value) continue; // a flag
      if (equals > 0) {
        add(name, option.canonicalName, option.value, [word.slice(equals + 1)], option.mate, option.threads);
        continue;
      }
      const next = words[i + 1];
      if (next === undefined || (option.value.optional && next.startsWith("-") && next.length > 1)) continue;
      const values = [next];
      i++;
      if (option.value.multiple) while (i + 1 < words.length && !(words[i + 1].startsWith("-") && words[i + 1].length > 1)) values.push(words[++i]);
      add(name, option.canonicalName, option.value, values, option.mate, option.threads);
      continue;
    }
    if (argumentsUnknown) continue;
    // Arguments in order; a variadic argument takes every remaining word, extra words are ignored.
    const argument = args[position];
    if (!argument) continue;
    add(argName(argument), argument.name, argument.value, [word], argument.mate, false);
    if (!(argument.variadic || argument.value?.multiple)) position++;
  }
  return { command, bound, typed };
};

/** Every path of a value: one, or several separated by commas (bowtie2 `-1 a_R1.fq,b_R1.fq`). */
const pathsOf = (value: string, ctx: CheckContext, resolve: (v: string) => string): string[] =>
  value.includes(",") && !ctx.exists(resolve(value)) ? value.split(",").filter((part) => part !== "") : [value];

export const checkLine = (line: string, catalog: Catalog, ctx: CheckContext): CheckResult => {
  const tokenized = tokenize(line);
  if (!tokenized.ok) return { ok: false, reason: tokenized.reason };
  const formats = new Map<string, Format>(catalog.listFormats().map((format) => [format.name, format])); // read once by the reader
  const resolve = (value: string) => path.resolve(ctx.cwd, ctx.home && value.startsWith("~/") ? path.join(ctx.home, value.slice(2)) : value);
  const analysed: { tool: string; command: string[] }[] = [];
  const warnings: Warning[] = [];

  for (const words of tokenized.commands) {
    const read = bind(catalog, words);
    if (!read) continue;
    const { command, bound, typed } = read;
    analysed.push({ tool: command.tool, command: command.path });
    const warn = (rule: RuleId, subjects: string[], message: string, severity: "warning" | "info" = "warning") =>
      warnings.push({ rule, severity, tool: command.tool, command: command.path, subjects, message });
    const shown = (b: Bound, value: string) => `${b.subject} ${value}`;
    const prefixFormats = (spec: ValueSpec) => spec.formats.map((name) => formats.get(name)).filter((f): f is Format => f?.kind === "prefix");
    const dirFormats = (spec: ValueSpec) => spec.formats.map((name) => formats.get(name)).filter((f): f is Format => f?.kind === "dir");

    // 1. Read pairs: the value of read 1's mate option should be its mate.
    for (const r1 of bound.filter((b) => b.spec.readRole === 1 && b.mate)) {
      const r2 = bound.find((b) => b.key === r1.mate && b.spec.readRole === 2);
      if (!r2) continue;
      const ones = r1.values.flatMap((v) => pathsOf(v, ctx, resolve));
      const twos = r2.values.flatMap((v) => pathsOf(v, ctx, resolve));
      if (ones.length !== twos.length) continue;
      ones.forEach((one, k) => {
        const two = twos[k];
        if (notAPath(one) || notAPath(two)) return;
        const n1 = readNumber(one);
        const n2 = readNumber(two);
        if (n1 === undefined || n2 === undefined) return;
        if (n1 === 2 && n2 === 1) {
          warn("read-pair", [r1.subject, r2.subject], `read 1 and read 2 are swapped: ${shown(r1, one)} is a read 2 file, ${shown(r2, two)} a read 1 file`);
        } else if (n1 === 1 && n2 === 2 && mateName(resolve(one)) !== resolve(two)) {
          const s1 = sampleOf(one);
          const s2 = sampleOf(two);
          warn(
            "read-pair",
            [r1.subject, r2.subject],
            s1 !== s2
              ? `${shown(r2, two)} is not the mate of ${shown(r1, one)}: samples ${s1} and ${s2}`
              : `${shown(r2, two)} is not the mate of ${shown(r1, one)}: they are in different folders`,
          );
        } else if (n1 === n2) {
          warn("read-pair", [r1.subject, r2.subject], `${shown(r1, one)} and ${shown(r2, two)} are both read ${n1} files`);
        }
      });
    }

    // 2. An output that is also an input.
    const inputs = new Map<string, string>();
    for (const b of bound.filter((b) => b.spec.io === "input"))
      for (const v of b.values) for (const p of pathsOf(v, ctx, resolve)) if (!notAPath(p)) inputs.set(resolve(p), shown(b, p));
    for (const b of bound.filter((b) => b.spec.io === "output"))
      for (const v of b.values) {
        if (notAPath(v)) continue;
        const same = inputs.get(resolve(v));
        if (same) warn("output-is-input", [b.subject], `${shown(b, v)} would overwrite the input ${same}`);
      }

    // 3. An output in a folder that does not exist.
    for (const b of bound.filter((b) => b.spec.io === "output"))
      for (const v of b.values) {
        if (notAPath(v)) continue;
        const target = resolve(v);
        // A folder output may be created by the tool, but not its parents.
        const parent = path.dirname(target);
        if (!ctx.exists(parent))
          warn("output-folder-missing", [b.subject], `${shown(b, v)}: the folder ${path.relative(ctx.cwd, parent) || parent} does not exist`);
      }

    // 4. A missing input (Reference indexes are rule 5).
    for (const b of bound.filter((b) => b.spec.io === "input" && prefixFormats(b.spec).length === 0))
      for (const v of b.values) {
        const missing = pathsOf(v, ctx, resolve).filter((p) => !notAPath(p) && !ctx.exists(resolve(p)));
        for (const p of missing) warn("input-missing", [b.subject], `${shown(b, p)} does not exist`);
      }

    // 5. Reference indexes: every file of a prefix index, the marker of an index folder.
    for (const b of bound.filter((b) => b.spec.io !== "output")) {
      const prefixes = prefixFormats(b.spec);
      const folders = b.spec.type === "dir" ? dirFormats(b.spec) : [];
      for (const v of b.values) {
        if (notAPath(v)) continue;
        const target = resolve(v);
        if (prefixes.length > 0) {
          if (prefixes.some((format) => format.suffixes.every((suffix) => ctx.exists(target + suffix)))) continue;
          const present = prefixes.find((format) => format.suffixes.some((suffix) => ctx.exists(target + suffix)));
          if (present) {
            const absent = present.suffixes.filter((suffix) => !ctx.exists(target + suffix));
            warn("reference-index", [b.subject], `${shown(b, v)}: the ${present.name} is incomplete, ${absent.join(", ")} missing`);
            continue;
          }
          // Nothing at all named after the prefix: no index (another layout, such as bowtie2's .bt2l, leaves files there).
          const dir = path.dirname(target);
          const base = path.basename(target);
          const anyFile = ctx.list(dir).some((entry) => entry.startsWith(`${base}.`));
          if (b.spec.io === "input" && !anyFile)
            warn("reference-index", [b.subject], `${shown(b, v)}: no ${prefixes[0].name} there (${prefixes[0].suffixes.join(", ")} missing)`);
        } else if (folders.length > 0 && b.spec.io === "input" && ctx.isDirectory(target)) {
          const entries = new Set(ctx.list(target));
          if (!folders.some((format) => format.markers.some((marker) => entries.has(marker))))
            warn("reference-index", [b.subject], `${shown(b, v)} is not a ${folders[0].name} (no ${folders[0].markers.join(" or ")})`);
        }
      }
    }

    // 6. More threads than CPUs.
    for (const b of bound.filter((b) => b.threads)) {
      const n = Number(b.values[b.values.length - 1]);
      if (Number.isInteger(n) && n > ctx.cpus.count) {
        const where = ctx.cpus.source === "SLURM_CPUS_PER_TASK" ? "to this SLURM job" : ctx.cpus.source === "cgroup" ? "in this cgroup" : "on this machine";
        warn("threads-above-cpus", [b.subject], `${b.subject} ${n} asks for ${n} threads; only ${ctx.cpus.count} CPUs are available ${where}`);
      }
    }

    // 7. Options the installed version doesn't have, or that the Catalog marks deprecated.
    const installed = ctx.installed?.(command.tool);
    const profile = installed?.profile(command.path.join(" "));
    const known = profile && profile.length > 0 ? new Set(profile.flatMap((option) => option.names)) : undefined;
    const label = [command.tool, ...command.path].join(" ");
    const versionText = installed?.version ? `${command.tool} ${installed.version}` : `the installed ${command.tool}`;
    const reported = new Set<string>();
    for (const { name, option } of typed) {
      if (reported.has(name)) continue;
      if (known) {
        const present = option ? option.aliases.some((alias) => known.has(alias)) : known.has(name);
        if (!present) {
          reported.add(name);
          warn("option-version", [name], `${name} is not an option of ${label} (${versionText})`);
          continue;
        }
      } else if (option && installed?.version && !withinVersions(installed.version, option.since, option.until)) {
        reported.add(name);
        const when =
          option.since && !withinVersions(installed.version, option.since, null) ? `appeared in ${option.since}` : `was removed after ${option.until}`;
        warn("option-version", [name], `${name} ${when}; ${versionText} is installed`);
        continue;
      }
      if (option?.deprecated) {
        reported.add(name);
        warn("option-deprecated", [name], `${name} is deprecated in ${label}`, "info");
      }
    }
  }
  if (analysed.length === 0) return { ok: false, reason: "no tool of the Catalog on this line" };
  return { ok: true, analysed, warnings };
};
