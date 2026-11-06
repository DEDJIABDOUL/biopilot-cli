// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { compileCatalog, type CompileResult } from "../../biopilot/knowledge/compile.js";
import { SCHEMAS_DIR } from "../../biopilot/knowledge/yamlSource.js";

/** better-sqlite3's prebuilt addon for this platform: the file the standalone binary ships and extracts. */
export const prebuiltSqliteAddon = path.join(
  path.dirname(createRequire(import.meta.url).resolve("better-sqlite3/package.json")),
  "prebuilds",
  `${process.platform}-${process.arch}.node`,
);

/** A fresh temporary folder; tests never touch the user's home. */
export const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-test-"));

/** Writes tool YAML sources (file name → content) into a new temporary sources folder. */
export const writeSources = (files: Record<string, string>): string => {
  const dir = tempDir();
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
};

/** Shared formats used by the fixtures: one of each kind. */
export const FORMATS = `
formats:
  - name: fastq
    description: sequencing reads
    pattern: '\\.(fastq|fq)(\\.gz|\\.bz2)?$'
  - name: fasta
    pattern: '\\.(fasta|fa|fna)(\\.gz)?$'
  - name: bwa-index
    kind: prefix
    suffixes: [".amb", ".ann", ".bwt", ".pac", ".sa"]
  - name: salmon-index
    kind: dir
    marker: versionInfo.json
`;

/** Compiles sources (and a formats file, `FORMATS` by default) into a temporary Catalog file. */
export const compile = (files: Record<string, string>, formats: string = FORMATS): { result: CompileResult; catalogPath: string } => {
  const sourcesDir = writeSources(files);
  const formatsPath = path.join(tempDir(), "formats.yml");
  fs.writeFileSync(formatsPath, formats);
  const catalogPath = path.join(tempDir(), "knowledge.db");
  return { result: compileCatalog({ sourcesDir, formatsPath, outputPath: catalogPath, biopilotVersion: "test" }), catalogPath };
};

/** Compiles sources that must be valid and returns the Catalog path. */
export const compileValid = (files: Record<string, string>, formats?: string): string => {
  const { result, catalogPath } = compile(files, formats);
  if (!result.ok) throw new Error(`fixture failed to compile: ${JSON.stringify(result.errors)}`);
  return catalogPath;
};

/** The repository's own knowledge sources (`knowledge/`), as `npm run build:db` compiles them. */
export const REPOSITORY_KNOWLEDGE = {
  sourcesDir: path.resolve(SCHEMAS_DIR, "..", "knowledge", "tools"),
  formatsPath: path.resolve(SCHEMAS_DIR, "..", "knowledge", "formats.yml"),
};

/** Compiles the repository's own Catalog into `outputPath` (a new temporary file by default). */
export const compileRepositoryCatalog = (outputPath: string = path.join(tempDir(), "knowledge.db")): { catalogPath: string; toolCount: number } => {
  const result = compileCatalog({ ...REPOSITORY_KNOWLEDGE, outputPath, biopilotVersion: "test" });
  if (!result.ok) throw new Error(`the repository's knowledge failed to compile: ${JSON.stringify(result.errors)}`);
  return { catalogPath: outputPath, toolCount: result.toolCount };
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

/** A tool with subcommands (one nested level and a deeper one) and positional arguments. */
export const SAMTOOLS = `
name: samtools
description: SAM/BAM/CRAM toolkit
version: { args: ["--version"], regex: 'samtools (\\S+)' }
options:
  - names: ["-o"]
    description: root-level option, unrelated to sort's -o
commands:
  - name: sort
    help: ["sort"]
    description: sort alignments
    options:
      - names: ["-o"]
        description: output file
        value: { type: string }
        rank: 90
      - names: ["-@", "--threads"]
        value: { type: int }
        rank: 75
    arguments:
      - name: in.bam
        description: alignments to sort
  - name: view
    description: view and convert
    arguments:
      - name: in.bam
      - name: region
        variadic: true
  - name: deep
    commands:
      - name: deeper
        description: two levels down
        options:
          - names: ["--flag"]
`;

/** Options and arguments using every value feature: formats, read pairs, derived output, enums, forms, versions. */
export const TRIMMER = `
name: trimmer
version: { args: ["--version"], regex: 'v(\\S+)' }
options:
  - names: ["-i", "--in1"]
    value: { type: file, format: fastq, read_role: 1 }
    rank: 95
  - names: ["-I", "--in2"]
    value: { type: file, format: fastq, read_role: 2, mate_of: "-i" }
  - names: ["-o", "--out1"]
    value: { type: file, format: fastq, derive: { from: "--in1", suffix: ".trimmed" } }
  - names: ["--index"]
    value: { type: dir, format: salmon-index }
  - names: ["--mode"]
    value:
      type: enum
      values:
        - { value: fast, description: quick and rough }
        - slow
  - names: ["--adapter"]
    value: { type: string, values: [AGATCGGAAGAGC] }
  - names: ["--color"]
    value: { type: string, optional: true }
  - names: ["--region"]
    value: { type: string, multiple: true }
    repeatable: true
  - names: ["--dedup"]
    since: "0.22.0"
  - names: ["--old"]
    until: "0.20.1"
    deprecated: true
    rank: 10
  - names: ["--debug-dump"]
    hidden: true
arguments:
  - name: reference
    value: { type: file, format: fasta }
  - name: reads
    variadic: true
    value: { type: file, format: fastq, read_role: 1 }
    default: reads.fq
    since: "1.0"
`;

/** Positional arguments whose value is optional, or takes several values. */
export const PACKER = `
name: packer
version: { args: ["--version"], regex: 'v(\\S+)' }
arguments:
  - name: archive
    value: { type: file, multiple: true }
  - name: level
    value: { type: int, optional: true }
`;

/** Options boosted by context rules (annex B of the spec, plus negative and empty conditions). */
export const RULED = `
name: ruled
version: { args: ["--version"], regex: 'v(\\S+)' }
options:
  - names: ["-i", "--in1"]
    description: read 1 input file
    value: { type: file, read_role: 1 }
    rank: 95
  - names: ["-I", "--in2"]
    description: read 2 input file
    value: { type: file, read_role: 2, mate_of: "-i" }
    rank: 60
    rules:
      - when: { used: ["-i"], paired: true }
        boost: 35
  - names: ["--nanopore-mode"]
    description: tuning for long reads
    rules:
      - when: { platform: nanopore }
        boost: 40
      - when: { platform: illumina }
        boost: -30
  - names: ["--quant"]
    description: transcript quantification
    rules:
      - when: { assay: rna-seq }
        boost: 20
      - when: {}
        boost: 5
`;

/** Formats for ALIGNER: a folder format with several markers. */
export const ALIGNER_FORMATS = `
formats:
  - name: bam
    pattern: '\\.bam$'
  - name: sam
    pattern: '\\.sam$'
  - name: fastq
    pattern: '\\.(fastq|fq)(\\.gz)?$'
  - name: bwa-index
    kind: prefix
    suffixes: [".bwt", ".sa"]
  - name: salmon-index
    kind: dir
    marker: [versionInfo.json, refseq.bin]
`;

/** Several formats per value, argument mates, bare help and version. */
export const ALIGNER = `
name: aligner
version: { args: [], regex: 'Version: (\\S+)' }
help: []
commands:
  - name: sort
    options:
      - names: ["-o"]
        value: { type: file, format: [bam, sam] }
    arguments:
      - name: in
        value: { type: file, format: [bam, sam] }
  - name: mem
    help: [mem]
    arguments:
      - name: reference
        value: { type: file, format: bwa-index }
      - name: in1
        value: { type: file, format: fastq, read_role: 1 }
      - name: in2
        value: { type: file, format: fastq, read_role: 2, mate_of: in1 }
`;
