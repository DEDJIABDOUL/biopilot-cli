// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The real Catalog, part A (ticket #11): fastp, Porechop, FastQC, MultiQC and salmon, compiled from
// knowledge/ and read back through the reader.

import fs from "node:fs";
import path from "node:path";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { tempDir } from "../helpers.js";

const knowledge = path.resolve("knowledge");

describe("real Catalog, part A", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const outputPath = path.join(tempDir(), "knowledge.db");
    const result = compileCatalog({
      sourcesDir: path.join(knowledge, "tools"),
      formatsPath: path.join(knowledge, "formats.yml"),
      outputPath,
      biopilotVersion: "test",
    });
    if (!result.ok) throw new Error(`the real Catalog does not compile: ${JSON.stringify(result.errors)}`);
    const opened = openCatalog(outputPath);
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  const command = (tool: string, ...sub: string[]): Command => {
    const found = catalog.getCommand(tool, sub);
    if (!found) throw new Error(`no command ${[tool, ...sub].join(" ")}`);
    return found;
  };
  const option = (cmd: Command, alias: string) => {
    const found = catalog.findOption(cmd, alias);
    if (!found) throw new Error(`no option ${alias}`);
    return found;
  };

  test("the five tools are there, with their annex A platforms", () => {
    expect(catalog.getTool("fastp")?.platforms).toEqual(["illumina"]);
    expect(catalog.getTool("porechop")?.platforms).toEqual(["nanopore"]);
    expect(catalog.getTool("fastqc")?.platforms).toEqual([]);
    expect(catalog.getTool("multiqc")?.platforms).toEqual([]);
    expect(catalog.getTool("salmon")?.platforms).toEqual(["illumina"]);
  });

  test("fastp: --in1 is the top root option (annex C, scenario 1)", () => {
    const options = catalog.listOptions(command("fastp"));
    expect(options[0].canonicalName).toBe("--in1");
    expect(options[0].rank).toBeGreaterThan(options[1].rank);
    expect(options[0].value).toMatchObject({ type: "file", format: "fastq", readRole: 1 });
  });

  test("fastp: --in2 is the R2 mate of --in1, boosted as in annex B", () => {
    const in2 = option(command("fastp"), "-I");
    expect(in2).toMatchObject({ canonicalName: "--in2", rank: 60, mate: "--in1" });
    expect(in2.value).toMatchObject({ format: "fastq", readRole: 2 });
    expect(in2.rules).toContainEqual({ when: { used: ["--in1"], paired: true, platform: null, assay: null }, boost: 35 });
  });

  test("fastp: --out1 derives from --in1 with .trimmed; --dedup appeared in 0.22.0", () => {
    const root = command("fastp");
    expect(option(root, "-o").derive).toEqual({ from: "--in1", suffix: ".trimmed" });
    expect(option(root, "--out2").derive).toEqual({ from: "--in2", suffix: ".trimmed" });
    expect(option(root, "-D").since).toBe("0.22.0");
    expect(option(root, "--cut_by_quality5")).toMatchObject({ deprecated: true, rank: 10 });
  });

  test("Porechop: --input first, output derived from it, enum output format", () => {
    const root = command("porechop");
    expect(catalog.listOptions(root)[0].canonicalName).toBe("--input");
    expect(option(root, "-o").derive).toEqual({ from: "--input", suffix: ".trimmed" });
    expect(option(root, "--format").value?.type).toBe("enum");
    expect(option(root, "--barcode_dir").value?.type).toBe("dir");
  });

  test("FastQC: files to check are a variadic FASTQ argument; --outdir leads", () => {
    const root = command("fastqc");
    expect(catalog.listArguments(root)).toEqual([
      expect.objectContaining({ name: "files", variadic: true, value: expect.objectContaining({ type: "file", format: "fastq" }) }),
    ]);
    expect(catalog.listOptions(root)[0].canonicalName).toBe("--outdir");
    expect(option(root, "--nogroup").rules).toContainEqual(expect.objectContaining({ when: expect.objectContaining({ platform: "nanopore" }), boost: -20 }));
  });

  test("MultiQC: --x and --no-x are distinct options; repeatable options", () => {
    const root = command("multiqc");
    expect(option(root, "--data-dir").canonicalName).toBe("--data-dir");
    expect(option(root, "--no-data-dir").canonicalName).toBe("--no-data-dir");
    expect(option(root, "-dd").canonicalName).toBe("--dirs-depth");
    expect(option(root, "-v").repeatable).toBe(true);
    expect(option(root, "--dev").canonicalName).toBe("--development");
  });

  test("salmon: every subcommand, index folders and the -1/-2 read pair", () => {
    const root = command("salmon");
    expect(catalog.listSubcommands(root).map((c) => c.path.join(" "))).toEqual(["index", "quant", "quantmerge", "debug-map", "help"]);
    const quant = command("salmon", "quant");
    expect(option(quant, "-i").value).toMatchObject({ type: "dir", format: "salmon-index" });
    expect(option(quant, "-2")).toMatchObject({ canonicalName: "--mates2", mate: "--mates1" });
    expect(option(quant, "-1").value).toMatchObject({ multiple: true, readRole: 1 });
    expect(option(quant, "--writeSam").canonicalName).toBe("--writeMappings");
    expect(option(command("salmon", "quantmerge"), "--quants").value).toMatchObject({ type: "dir", format: "salmon-quant", multiple: true });
    expect(option(command("salmon", "index"), "-t").value).toMatchObject({ format: "fasta" });
  });

  test("every option of the five tools has a description and a rank on the scale", () => {
    const walk = (cmd: Command): Command[] => [cmd, ...catalog.listSubcommands(cmd).flatMap(walk)];
    for (const tool of ["fastp", "porechop", "fastqc", "multiqc", "salmon"]) {
      for (const cmd of walk(command(tool))) {
        for (const opt of catalog.listOptions(cmd)) {
          expect({ tool, path: cmd.path, option: opt.canonicalName, described: Boolean(opt.description) }).toMatchObject({ described: true });
          expect(opt.rank).toBeGreaterThanOrEqual(10);
          expect(opt.rank).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  test("every help recording of part A is present with its attribution", () => {
    const recordings = ["fastp/1.4.0", "fastp/0.23.4", "fastp/0.20.1", "porechop/0.2.4", "fastqc/0.13.0", "multiqc/1.35", "salmon/2.11.0"];
    for (const dir of recordings) {
      const recording = fs.readFileSync(path.join(knowledge, "help", dir, "RECORDING.yml"), "utf-8");
      expect(recording).toMatch(/^licence: \S/m);
      for (const [, file] of recording.matchAll(/^ {2}(\S+\.txt):/gm)) {
        expect(fs.statSync(path.join(knowledge, "help", dir, file)).size).toBeGreaterThan(0);
      }
    }
  });
});
