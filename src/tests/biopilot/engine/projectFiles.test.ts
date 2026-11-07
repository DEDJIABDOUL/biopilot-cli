// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Files offered for values of a format (spec §8.2, ticket #49), in the annex C project: files of the
// expected format and folders, R1 first, the mate of a typed R1 first, derived outputs, indexes.

import fs from "node:fs";
import path from "node:path";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, tempDir } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

/** A project folder holding these (relative) files; a trailing `/` makes a folder. */
const project = (entries: string[]) => {
  const root = tempDir();
  for (const entry of entries) {
    const file = path.join(root, entry);
    if (entry.endsWith("/")) fs.mkdirSync(file, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "");
    }
  }
  return root;
};

/** The annex C project, with a few files of other formats. */
const ANNEX_C = [
  ".git/",
  "data/ctrl_R1.fastq.gz",
  "data/ctrl_R2.fastq.gz",
  "data/treat_R1.fastq.gz",
  "data/treat_R2.fastq.gz",
  "results/",
  "ref/genome.fa",
  ...[".amb", ".ann", ".bwt", ".pac", ".sa"].map((suffix) => `ref/genome.fa${suffix}`),
  "aln/x.bam",
  "aln/y.sam",
  "notes.txt",
  "quant/idx/refseq.bin",
];
const annexC = project(ANNEX_C);
const noResults = project(ANNEX_C.filter((entry) => entry !== "results/"));

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  runtime = await import("../../../runtime/runtime.js");
});

const suggest = async (line: string, cwd = annexC) => (await runtime.getSuggestions(line, cwd, Shell.Bash))?.suggestions ?? [];
const names = async (line: string, cwd = annexC) => (await suggest(line, cwd)).map((s) => s.name);

describe("files of the expected format", () => {
  test("annex C 2: `fastp --in1 ` → data/ctrl_R1.fastq.gz, then data/treat_R1.fastq.gz", async () => {
    expect((await names("fastp --in1 ")).slice(0, 2)).toEqual(["data/ctrl_R1.fastq.gz", "data/treat_R1.fastq.gz"]);
  });

  test("only files of the format, and folders to navigate", async () => {
    const suggested = await names("fastp --in1 ");
    expect(suggested).toEqual(expect.arrayContaining(["data/ctrl_R2.fastq.gz", "data", "ref"]));
    expect(suggested).not.toContain("notes.txt");
    expect(suggested).not.toContain("aln/x.bam");
  });

  test("inside a typed folder, its files of the format", async () => {
    expect((await names("fastp --in1 data/")).slice(0, 2)).toEqual(["ctrl_R1.fastq.gz", "treat_R1.fastq.gz"]);
  });

  test("annex C 3: after an R1, its mate leads", async () => {
    expect((await names("fastp --in1 data/treat_R1.fastq.gz --in2 "))[0]).toBe("data/treat_R2.fastq.gz");
    expect((await names("fastp --in1 data/treat_R1.fastq.gz --in2 data/"))[0]).toBe("treat_R2.fastq.gz");
  });

  test("annex C 5: a derived output, in results/ when it exists, else next to the input", async () => {
    expect((await names("fastp --in1 data/ctrl_R1.fastq.gz --out1 "))[0]).toBe("results/ctrl_R1.trimmed.fastq.gz");
    expect((await names("fastp --in1 data/ctrl_R1.fastq.gz --out1 ", noResults))[0]).toBe("data/ctrl_R1.trimmed.fastq.gz");
  });

  test("annex C 8: `bwa mem ` → the reference of the bwa index, once, before the options", async () => {
    const suggested = await names("bwa mem ");
    expect(suggested[0]).toBe("ref/genome.fa");
    expect(suggested.filter((name) => name.startsWith("ref/genome.fa"))).toEqual(["ref/genome.fa"]);
  });

  test("a salmon index is offered as its folder", async () => {
    expect(await names("salmon quant -i ")).toContain("quant/idx");
  });

  test("annex C 9: `samtools sort ` → BAM and SAM files first", async () => {
    expect((await names("samtools sort ")).slice(0, 2).sort()).toEqual(["aln/x.bam", "aln/y.sam"]);
  });

  test("no file of the format at all: every file is offered", async () => {
    const plain = project([".git/", "a.txt", "b.log"]);
    expect(await names("fastp --in1 ", plain)).toEqual(expect.arrayContaining(["a.txt", "b.log"]));
  });

  test("from a subfolder, paths are relative to it", async () => {
    expect((await names("fastp --in1 ", path.join(annexC, "data"))).slice(0, 2)).toEqual(["ctrl_R1.fastq.gz", "treat_R1.fastq.gz"]);
  });

  test("file suggestions are files, so the engine completes them as paths", async () => {
    expect((await suggest("fastp --in1 "))[0]).toMatchObject({ name: "data/ctrl_R1.fastq.gz", type: "file" });
  });
});
