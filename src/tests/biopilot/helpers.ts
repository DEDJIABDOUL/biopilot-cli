// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileCatalog, type CompileResult } from "../../biopilot/knowledge/compile.js";

/** A fresh temporary folder; tests never touch the user's home. */
export const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-test-"));

/** Writes tool YAML sources (file name → content) into a new temporary sources folder. */
export const writeSources = (files: Record<string, string>): string => {
  const dir = tempDir();
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
};

/** Compiles sources into a temporary Catalog file. */
export const compile = (files: Record<string, string>): { result: CompileResult; catalogPath: string } => {
  const sourcesDir = writeSources(files);
  const catalogPath = path.join(tempDir(), "knowledge.db");
  return { result: compileCatalog({ sourcesDir, outputPath: catalogPath, biopilotVersion: "test" }), catalogPath };
};

/** Compiles sources that must be valid and returns the Catalog path. */
export const compileValid = (files: Record<string, string>): string => {
  const { result, catalogPath } = compile(files);
  if (!result.ok) throw new Error(`fixture failed to compile: ${JSON.stringify(result.errors)}`);
  return catalogPath;
};

export const FASTP = `
name: fastp
package: fastp
description: FASTQ preprocessing
platforms: [illumina]
version: { args: ["--version"], regex: 'fastp (\\d[\\w.]*)' }
help: ["--help"]
options:
  - names: ["-i", "--in1"]
    description: read 1 input
    value: { type: string }
    rank: 95
  - names: ["-I", "--in2"]
    description: read 2 input
    value: { type: string }
    rank: 60
  - names: ["-w", "--thread"]
    value: { type: int }
    default: 3
    rank: 75
  - names: ["-D", "--dedup"]
    rank: 60
  - names: ["-z"]
    value: { type: int }
`;

export const MULTIQC = `
name: multiqc
description: aggregates reports
version: { args: ["--version"], regex: 'version (\\S+)' }
options:
  - names: ["-o", "--outdir"]
    value: { type: string }
    rank: 90
`;
