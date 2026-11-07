// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Project detection (spec §8.1, ticket #48): file names only, on temporary project folders.

import fs from "node:fs";
import path from "node:path";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { detectProject } from "../../../biopilot/project/detect.js";
import { compileRepositoryCatalog, tempDir } from "../helpers.js";

let catalog: Catalog;
beforeAll(() => {
  const opened = openCatalog(compileRepositoryCatalog().catalogPath);
  if (!opened.available) throw new Error(opened.detail);
  catalog = opened.catalog;
});
afterAll(() => catalog.close());

/** A project folder holding these (relative) files; a trailing `/` makes a folder. */
const project = (entries: string[], content: Record<string, string> = {}) => {
  const root = tempDir();
  for (const entry of entries) {
    const file = path.join(root, entry);
    if (entry.endsWith("/")) fs.mkdirSync(file, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content[entry] ?? "");
    }
  }
  return root;
};
const detect = (cwd: string) => detectProject(cwd, catalog);

/** The annex C project. */
const ANNEX_C = [
  ".git/",
  "data/ctrl_R1.fastq.gz",
  "data/ctrl_R2.fastq.gz",
  "data/treat_R1.fastq.gz",
  "data/treat_R2.fastq.gz",
  "results/",
  "ref/genome.fa",
  ...[".amb", ".ann", ".bwt", ".pac", ".sa"].map((suffix) => `ref/genome.fa${suffix}`),
];

describe("project detection", () => {
  test("the root is the first parent with a project marker; files are relative to it", () => {
    const root = project(ANNEX_C);
    const detected = detect(path.join(root, "data"));
    expect(detected.root).toBe(root);
    expect(detected.marker).toBe(".git");
    expect(detected.files).toEqual(expect.arrayContaining(["data/ctrl_R1.fastq.gz", "ref/genome.fa.bwt"]));
  });

  test("without any marker, the current folder alone", () => {
    const root = project(["reads_R1.fq", "reads_R2.fq"]);
    expect(detect(root)).toMatchObject({ root, marker: null });
  });

  test.each([
    ["Snakefile", "Snakefile"],
    ["nextflow.config", "nextflow.config"],
    ["environment.yml", "environment.yml"],
    [".biopilot.toml", ".biopilot.toml"],
  ])("%s marks the root", (marker) => {
    const root = project([marker, "sub/x.fq"]);
    expect(detect(path.join(root, "sub")).marker).toBe(marker);
  });

  test("read pairs: both mates must exist, names identical but for the marker", () => {
    const detected = detect(
      project([
        ".git/",
        "a_R1.fastq.gz",
        "a_R2.fastq.gz",
        "b_1.fq",
        "b_2.fq",
        "c.R1.fq.gz",
        "c.R2.fq.gz",
        "d_R1_001.fastq.gz",
        "d_R2_001.fastq.gz",
        "rep_1.fastq.gz",
      ]),
    );
    expect(detected.pairs).toEqual(
      expect.arrayContaining([
        { r1: "a_R1.fastq.gz", r2: "a_R2.fastq.gz" },
        { r1: "b_1.fq", r2: "b_2.fq" },
        { r1: "c.R1.fq.gz", r2: "c.R2.fq.gz" },
        { r1: "d_R1_001.fastq.gz", r2: "d_R2_001.fastq.gz" },
      ]),
    );
    expect(detected.pairs).toHaveLength(4);
    expect(detected.paired).toBe(true);
  });

  test("a lone `rep_1.fastq.gz` is not a pair", () => {
    expect(detect(project([".git/", "rep_1.fastq.gz"]))).toMatchObject({ paired: false, pairs: [] });
  });

  test.each([
    ["pod5 files", ["run/a.pod5"], ["nanopore"]],
    ["fast5 files", ["run/a.fast5"], ["nanopore"]],
    ["a sequencing summary", ["sequencing_summary_FAQ123.txt"], ["nanopore"]],
    ["a fastq_pass folder", ["fastq_pass/"], ["nanopore"]],
    ["complete read pairs", ["s_R1.fq", "s_R2.fq"], ["illumina"]],
    ["Illumina lane names", ["s_S1_L001_R1_001.fastq.gz"], ["illumina"]],
    ["both", ["run/a.pod5", "s_R1.fq", "s_R2.fq"], ["illumina", "nanopore"]],
    ["nothing telling", ["notes.txt"], []],
  ])("platforms from %s", (_, files, platforms) => {
    expect(detect(project([".git/", ...files])).platforms).toEqual(platforms);
  });

  test("environment.yml is only a secondary platform hint", () => {
    const env = "dependencies:\n  - bioconda::porechop\n  - minimap2\n";
    expect(detect(project(["environment.yml"], { "environment.yml": env })).platforms).toEqual(["nanopore"]);
    expect(detect(project(["environment.yml", "s_R1.fq", "s_R2.fq"], { "environment.yml": env })).platforms).toEqual(["illumina"]);
  });

  test.each([
    ["an annotation", ["genes.gtf", "x.bam"], "rna-seq"],
    ["a salmon quantification", ["quant/quant.sf"], "rna-seq"],
    ["a salmon index", ["idx/refseq.bin"], "rna-seq"],
    ["variant calls", ["calls.vcf.gz"], "variant-calling"],
    ["alignments and an indexed reference", ["x.bam", "ref.fa", "ref.fa.fai"], "variant-calling"],
    ["alignments and a reference not indexed", ["x.bam", "ref.fa"], "unknown"],
    ["nothing telling", ["notes.txt"], "unknown"],
  ])("assay from %s", (_, files, assay) => {
    expect(detect(project([".git/", ...files])).assay).toBe(assay);
  });

  test("the walk skips hidden folders, node_modules, work/ and .snakemake/, and stops at depth 3", () => {
    const detected = detect(
      project([".git/", ".hidden/a.pod5", "node_modules/b.pod5", "work/c.pod5", ".snakemake/d.pod5", "a/b/c/deep.pod5", "a/b/shallow.fq"]),
    );
    expect(detected.files).toEqual(["a/b/shallow.fq"]);
    expect(detected.platforms).toEqual([]);
  });

  test("at most 2 000 entries are read", () => {
    const detected = detect(project([".git/", ...Array.from({ length: 2_100 }, (_, i) => `f${i}.txt`)]));
    expect(detected.files.length).toBeLessThanOrEqual(2_000);
    expect(detected.truncated).toBe(true);
  });

  test(".biopilot.toml has the last word on assay and platform, and gives results folder and reference", () => {
    const toml = 'assay = "variant-calling"\nplatform = ["nanopore"]\nresults_dir = "out"\nreference = "ref/GRCh38.fa"\n';
    const detected = detect(project([".biopilot.toml", "genes.gtf", "s_R1.fq", "s_R2.fq"], { ".biopilot.toml": toml }));
    expect(detected).toMatchObject({ assay: "variant-calling", platforms: ["nanopore"], config: { resultsDir: "out", reference: "ref/GRCh38.fa" } });
  });

  test("an invalid .biopilot.toml, or invalid values in it, are ignored", () => {
    expect(detect(project([".biopilot.toml", "genes.gtf"], { ".biopilot.toml": "assay = = 3" }))).toMatchObject({ assay: "rna-seq", config: null });
    const detected = detect(project([".biopilot.toml", "genes.gtf"], { ".biopilot.toml": 'assay = "chip-seq"\nplatform = "pacbio"\nresults_dir = 3' }));
    expect(detected).toMatchObject({ assay: "rna-seq", platforms: [], config: { resultsDir: null, reference: null } });
  });

  test("an unreadable folder gives an empty project, never an error", () => {
    expect(detect(path.join(tempDir(), "missing"))).toMatchObject({ files: [], platforms: [], assay: "unknown", paired: false });
  });
});
