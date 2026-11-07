// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The project around the current folder (spec §8.1): its root, platforms, assay, read pairs and files.
// Only file names are read, plus `environment.yml` (64 KB at most) and `.biopilot.toml`. Never throws.

import fs from "node:fs";
import path from "node:path";
import toml from "toml";
import type { Catalog } from "../knowledge/catalog.js";
import { ASSAYS, PLATFORMS, type Assay, type Platform } from "../knowledge/schema.js";

/** What BioPilot needs from the Catalog to recognise formats. */
export type FormatRecogniser = Pick<Catalog, "formatOfFile" | "matchFiles">;

/** R1 and R2 of a read pair, relative to the project root. */
export type ReadPair = { r1: string; r2: string };

/** What `.biopilot.toml` says; `null` fields were absent or invalid. */
export type ProjectConfig = { file: string; assay: Assay | null; platforms: Platform[] | null; resultsDir: string | null; reference: string | null };

export type Project = {
  root: string;
  /** The marker that made `root` the root; `null` when none was found (the current folder alone). */
  marker: string | null;
  /** Relative, `/`-separated paths of the files read, in walk order. */
  files: string[];
  /** Relative paths of the folders read. */
  folders: string[];
  /** The walk stopped at the entry cap. */
  truncated: boolean;
  pairs: ReadPair[];
  paired: boolean;
  /** Empty means generic. */
  platforms: Platform[];
  assay: Assay;
  config: ProjectConfig | null;
};

export const ROOT_MARKERS = [".git", "environment.yml", "Snakefile", "nextflow.config", ".biopilot.toml"];
const CONFIG_FILE = ".biopilot.toml";
const MAX_DEPTH = 3;
const MAX_ENTRIES = 2_000;
const SKIPPED_FOLDERS = new Set(["node_modules", "work"]);
const ENVIRONMENT_MAX_BYTES = 64 * 1024;
const CACHE_MS = 10_000;

/** `_R1`, `_1`, `.R1`, `_R1_001` just before the extension; group 2 is the read number. */
const MATE_MARKER = /(_R|_|\.R)([12])((?:_001)?\.[^/]+)$/;
const NANOPORE_FILE = /\.(pod5|fast5)$|^sequencing_summary.*\.txt$/;
const ILLUMINA_NAME = /_L00\d_|_S\d+_/;
/** Packages of `environment.yml` that hint at a platform, when the files tell nothing. */
const NANOPORE_PACKAGES = /\b(porechop|nanoplot|nanofilt|medaka|dorado|guppy|pod5|nanopolish|chopper|flye)\b/;
const ILLUMINA_PACKAGES = /\b(fastp|trimmomatic|cutadapt|bcl2fastq|trim-galore|bwa)\b/;

/** The first parent of `cwd` (itself included) holding a project marker. */
const findRoot = (cwd: string): { root: string; marker: string | null } => {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    const marker = ROOT_MARKERS.find((name) => fs.existsSync(path.join(dir, name)));
    if (marker) return { root: dir, marker };
    if (path.dirname(dir) === dir) return { root: path.resolve(cwd), marker: null };
  }
};

/** Breadth-first, names only, bounded by depth and entry count; hidden and tool folders skipped. */
const walk = (root: string): { files: string[]; folders: string[]; truncated: boolean } => {
  const files: string[] = [];
  const folders: string[] = [];
  let entries = 0;
  let queue: string[] = [""];
  for (let depth = 1; depth <= MAX_DEPTH && queue.length > 0; depth++) {
    const next: string[] = [];
    for (const relative of queue) {
      let listed: fs.Dirent[];
      try {
        listed = fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      } catch {
        continue;
      }
      for (const entry of listed) {
        if (entry.name.startsWith(".")) continue;
        if (entries >= MAX_ENTRIES) return { files, folders, truncated: true };
        entries++;
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (SKIPPED_FOLDERS.has(entry.name)) continue;
          folders.push(child);
          next.push(child);
        } else files.push(child);
      }
    }
    queue = next;
  }
  return { files, folders, truncated: false };
};

/** Complete read pairs among FASTQ files: both mates exist, names identical but for the marker. */
export const readPairs = (files: readonly string[], formats: FormatRecogniser): ReadPair[] => {
  const present = new Set(files);
  const pairs: ReadPair[] = [];
  for (const file of files) {
    const match = file.match(MATE_MARKER);
    if (!match || match[2] !== "1" || formats.formatOfFile(file)?.name !== "fastq") continue;
    const mate = `${file.slice(0, match.index)}${match[1]}2${match[3]}`;
    if (present.has(mate)) pairs.push({ r1: file, r2: mate });
  }
  return pairs;
};

const platformsFrom = (root: string, files: string[], folders: string[], pairs: ReadPair[], marker: string | null): Platform[] => {
  const found = new Set<Platform>();
  if (files.some((file) => NANOPORE_FILE.test(path.posix.basename(file))) || folders.some((folder) => path.posix.basename(folder) === "fastq_pass")) {
    found.add("nanopore");
  }
  if (pairs.length > 0 || files.some((file) => ILLUMINA_NAME.test(path.posix.basename(file)))) found.add("illumina");
  if (found.size === 0 && (marker === "environment.yml" || fs.existsSync(path.join(root, "environment.yml")))) {
    const text = readSmall(path.join(root, "environment.yml"), ENVIRONMENT_MAX_BYTES);
    if (text && NANOPORE_PACKAGES.test(text)) found.add("nanopore");
    if (text && ILLUMINA_PACKAGES.test(text)) found.add("illumina");
  }
  return PLATFORMS.filter((platform) => found.has(platform));
};

/** Formats only (spec §8.1): annotation or salmon → rna-seq; calls, or alignments on an indexed reference → variant-calling. */
const assayFrom = (files: string[], formats: FormatRecogniser): Assay => {
  const present = new Set(files.map((file) => formats.formatOfFile(file)?.name).filter((name): name is string => name !== undefined));
  const indexes = formats.matchFiles(files);
  if (
    present.has("gtf") ||
    present.has("gff") ||
    files.some((file) => path.posix.basename(file) === "quant.sf") ||
    indexes.some((match) => match.format === "salmon-index")
  )
    return "rna-seq";
  if (present.has("vcf") || present.has("bcf")) return "variant-calling";
  const indexedReference = files.some(
    (file) =>
      formats.formatOfFile(file)?.name === "fasta" &&
      (files.includes(`${file}.fai`) || indexes.some((match) => match.format === "bwa-index" && match.path === file)),
  );
  if ((present.has("bam") || present.has("cram")) && indexedReference) return "variant-calling";
  return "unknown";
};

/** A file's start, `undefined` when it cannot be read. */
const readSmall = (file: string, maxBytes: number): string | undefined => {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      return buffer.subarray(0, fs.readSync(fd, buffer, 0, maxBytes, 0)).toString("utf-8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return;
  }
};

/** `.biopilot.toml` at the root; an invalid file, or an invalid value in it, counts as absent. */
const readConfig = (root: string): ProjectConfig | null => {
  const file = path.join(root, CONFIG_FILE);
  const text = readSmall(file, ENVIRONMENT_MAX_BYTES);
  if (text === undefined) return null;
  let data: Record<string, unknown>;
  try {
    data = toml.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const platformList = typeof data.platform === "string" ? [data.platform] : Array.isArray(data.platform) ? data.platform : null;
  const platforms = platformList && platformList.every((p): p is Platform => (PLATFORMS as readonly unknown[]).includes(p)) ? platformList : null;
  return {
    file,
    assay: (ASSAYS as readonly unknown[]).includes(data.assay) ? (data.assay as Assay) : null,
    platforms,
    resultsDir: typeof data.results_dir === "string" ? data.results_dir : null,
    reference: typeof data.reference === "string" ? data.reference : null,
  };
};

const cache = new Map<string, { at: number; project: Project }>();

/** The project around `cwd`, cached 10 s per root. */
export const detectProject = (cwd: string, formats: FormatRecogniser, now = Date.now()): Project => {
  const { root, marker } = findRoot(cwd);
  const cached = cache.get(root);
  if (cached && now - cached.at < CACHE_MS) return cached.project;
  const { files, folders, truncated } = walk(root);
  const pairs = readPairs(files, formats);
  const config = readConfig(root);
  const project: Project = {
    root,
    marker,
    files,
    folders,
    truncated,
    pairs,
    paired: pairs.length > 0,
    platforms: config?.platforms ?? platformsFrom(root, files, folders, pairs, marker),
    assay: config?.assay ?? assayFrom(files, formats),
    config,
  };
  cache.set(root, { at: now, project });
  return project;
};
