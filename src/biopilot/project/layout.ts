// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The standard project layout that `biopilot create` lays out, and how a folder is recognised as one.
// The layout is itself a project marker: no hidden file is needed.

import fs from "node:fs";
import path from "node:path";

/** The folders of a project, from its root. Read files sit at depth 3 (`data/raw/s1_R1.fastq.gz`), inside the project scan. */
export const PROJECT_FOLDERS: readonly string[] = [
  "data/raw", // sequencing reads as received, never modified
  "data/processed", // intermediate files: trimmed reads, alignments
  "metadata", // sample sheets, experimental design
  "reference", // genome, annotation, indexes
  "results", // final outputs, where BioPilot derives output names
  "scripts", // analysis code
  "logs", // tools' logs
  "envs", // conda environment files
  "notebooks", // exploration, figures
  "docs", // notes, protocols, reports
];

/** The folders that, all together, make a folder a project root: few enough to survive tidying up, specific enough not to match by chance. */
export const LAYOUT_FOLDERS: readonly string[] = ["data/raw", "metadata", "reference", "results"];

/** The name `biopilot status` shows for this marker. */
export const LAYOUT_MARKER = "project layout";

const isFolder = (file: string): boolean => {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
};

/** Whether `dir` holds the standard layout. Stops at the first folder missing, `data/raw` first: one stat for most folders. */
export const hasProjectLayout = (dir: string): boolean => LAYOUT_FOLDERS.every((folder) => isFolder(path.join(dir, folder)));
