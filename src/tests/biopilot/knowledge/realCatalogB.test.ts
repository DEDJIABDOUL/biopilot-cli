// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The real Catalog, part B (ticket #12): compiles knowledge/ as shipped and checks a few
// curated facts per tool through the reader.

import path from "node:path";
import url from "node:url";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("real Catalog, part B: bwa, minimap2, samtools, bcftools, blastn", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const outputPath = path.join(tempDir(), "knowledge.db");
    const result = compileCatalog({
      sourcesDir: path.join(repoRoot, "knowledge", "tools"),
      formatsPath: path.join(repoRoot, "knowledge", "formats.yml"),
      outputPath,
      biopilotVersion: "test",
    });
    if (!result.ok) throw new Error(`the real Catalog failed to compile: ${JSON.stringify(result.errors)}`);
    const opened = openCatalog(outputPath);
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  const command = (tool: string, ...subPath: string[]): Command => {
    const found = catalog.getCommand(tool, subPath);
    if (!found) throw new Error(`no command ${[tool, ...subPath].join(" ")}`);
    return found;
  };
  const subcommands = (tool: string) => catalog.listSubcommands(command(tool)).map((c) => c.path.at(-1));

  test("the five tools are in the Catalog, with the platforms of annex A", () => {
    expect(catalog.getTool("bwa")?.platforms).toEqual(["illumina"]);
    expect(catalog.getTool("minimap2")?.platforms).toEqual(["nanopore"]);
    for (const generic of ["samtools", "bcftools", "blastn"]) expect(catalog.getTool(generic)?.platforms).toEqual([]);
    expect(catalog.getTool("blastn")?.package).toBe("blast");
  });

  test("bwa index takes a FASTA reference; bwa mem takes the index prefix, then read 1 and read 2", () => {
    expect(catalog.listArguments(command("bwa", "index"))[0].value).toMatchObject({ type: "file", format: "fasta" });
    const mem = catalog.listArguments(command("bwa", "mem"));
    expect(mem.map((argument) => argument.name)).toEqual(["idxbase", "in1.fq", "in2.fq"]);
    expect(mem[0].value).toMatchObject({ format: "bwa-index" });
    expect(mem[1].value).toMatchObject({ format: "fastq", readRole: 1, optional: false });
    expect(mem[2].value).toMatchObject({ format: "fastq", readRole: 2, optional: true });
    expect(catalog.findOption(command("bwa", "mem"), "-t")?.rank).toBeGreaterThanOrEqual(70);
  });

  test("bwa mem's two read files are mates; bwa's help and version run it bare", () => {
    const [, in1, in2] = catalog.listArguments(command("bwa", "mem"));
    expect([in1.mate, in2.mate]).toEqual([in2.name, in1.name]);
    expect(catalog.getTool("bwa")).toBeDefined();
  });

  test("samtools sort reads BAM, SAM or CRAM (annex C, scenario 9: BAM and SAM first)", () => {
    expect(catalog.listArguments(command("samtools", "sort"))[0].value?.formats).toEqual(["bam", "sam", "cram"]);
  });

  test("the minimap2 target is a FASTA reference or a prebuilt index", () => {
    expect(catalog.listArguments(command("minimap2"))[0].value?.formats).toEqual(["fasta", "minimap2-index"]);
  });

  test("minimap2 presets are the closed values of -x", () => {
    const preset = catalog.findOption(command("minimap2"), "-x")!;
    expect(preset.value?.type).toBe("enum");
    expect(preset.value?.values.map((v) => v.value)).toEqual(expect.arrayContaining(["map-ont", "map-hifi", "sr", "splice", "asm5", "lr:hq"]));
    expect(catalog.findOption(command("minimap2"), "-d")?.value?.format).toBe("minimap2-index");
  });

  test("samtools lists its subcommands, and sort has -o for a BAM", () => {
    expect(subcommands("samtools")).toEqual(expect.arrayContaining(["view", "sort", "index", "faidx", "flagstat", "merge", "depth", "markdup"]));
    const sort = command("samtools", "sort");
    const output = catalog.findOption(sort, "-o")!;
    expect(output.value).toMatchObject({ type: "file", format: "bam" });
    expect(output.rank).toBeGreaterThanOrEqual(90);
    expect(catalog.listOptions(sort)[0].canonicalName).toBe("-o");
    expect(catalog.listArguments(sort)[0].value?.format).toBe("bam");
    expect(catalog.findOption(sort, "-@")?.canonicalName).toBe("--threads");
  });

  test("samtools fastq writes read pairs to -1 and -2, which are mates", () => {
    const fastq = command("samtools", "fastq");
    expect(catalog.findOption(fastq, "-1")?.value?.readRole).toBe(1);
    expect(catalog.findOption(fastq, "-2")).toMatchObject({ mate: "-1", value: expect.objectContaining({ readRole: 2 }) });
  });

  test("bcftools: mpileup needs the reference, call has its usual options, view writes VCF", () => {
    expect(subcommands("bcftools")).toEqual(expect.arrayContaining(["view", "mpileup", "call", "index", "norm", "filter", "query", "merge", "concat"]));
    expect(catalog.findOption(command("bcftools", "mpileup"), "-f")).toMatchObject({ canonicalName: "--fasta-ref", rank: 95 });
    const call = command("bcftools", "call");
    expect(catalog.findOption(call, "-m")?.canonicalName).toBe("--multiallelic-caller");
    expect(catalog.findOption(call, "-v")?.canonicalName).toBe("--variants-only");
    expect(catalog.findOption(command("bcftools", "view"), "-o")?.value?.format).toBe("vcf");
    const config = catalog.findOption(command("bcftools", "mpileup"), "-X")!;
    expect(config.rules).toEqual([{ when: expect.objectContaining({ platform: "nanopore" }), boost: 25 }]);
  });

  test("blastn: single-dash options, -query first, -db a BLAST database", () => {
    const root = command("blastn");
    expect(catalog.listOptions(root)[0].canonicalName).toBe("-query");
    expect(catalog.findOption(root, "-db")?.value?.format).toBe("blast-nucl-db");
    expect(catalog.findOption(root, "-task")?.value?.values.map((v) => v.value)).toContain("megablast");
  });

  test("the part B index formats are recognised in a directory listing", () => {
    const matches = catalog.matchFiles([
      "ref/genome.fa",
      ...[".amb", ".ann", ".bwt", ".pac", ".sa"].map((s) => `ref/genome.fa${s}`),
      "db/nt.nhr",
      "db/nt.nin",
      "db/nt.nsq",
    ]);
    expect(matches).toEqual(
      expect.arrayContaining([
        { path: "ref/genome.fa", format: "bwa-index" },
        { path: "db/nt", format: "blast-nucl-db" },
      ]),
    );
    expect(catalog.formatOfFile("aln.bam.bai")?.name).toBe("bai");
    expect(catalog.formatOfFile("calls.paf")?.name).toBe("paf");
  });
});
