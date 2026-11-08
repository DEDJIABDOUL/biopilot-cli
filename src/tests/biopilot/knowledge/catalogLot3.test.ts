// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Catalog, lot 3 (ticket #82): variants, intervals and annotation, compiled from knowledge/ and read back.

import path from "node:path";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { tempDir } from "../helpers.js";

const knowledge = path.resolve("knowledge");

describe("Catalog, lot 3", () => {
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
  const first = (tool: string, ...sub: string[]) => catalog.listOptions(command(tool, ...sub))[0].canonicalName;

  test("the ten tools are there", () => {
    for (const tool of ["bedtools", "tabix", "bgzip", "gatk", "freebayes", "vcftools", "snpEff", "SnpSift", "vep", "vcfanno"])
      expect(catalog.getTool(tool)).toBeDefined();
    expect(catalog.getTool("bgzip")?.package).toBe("htslib");
    expect(catalog.getTool("gatk")?.package).toBe("gatk4");
  });

  test("a gVCF is recognised as such, a VCF as a VCF", () => {
    expect(catalog.formatOfFile("sample.g.vcf.gz")?.name).toBe("gvcf");
    expect(catalog.formatOfFile("sample.vcf.gz")?.name).toBe("vcf");
    expect(catalog.formatOfFile("tumor.vcf.gz.stats")?.name).toBe("mutect-stats");
    expect(catalog.formatOfFile("recal_data.table")?.name).toBe("gatk-table");
  });

  test("GATK: joint genotyping takes GVCFs, HaplotypeCaller writes either, bcftools still reads gVCFs", () => {
    expect(catalog.findOption(command("gatk", "GenotypeGVCFs"), "-V")?.value?.formats).toEqual(["gvcf"]);
    expect(catalog.findOption(command("gatk", "CombineGVCFs"), "-V")?.value?.formats).toEqual(["gvcf"]);
    expect(catalog.findOption(command("gatk", "HaplotypeCaller"), "-O")?.value?.formats).toEqual(["vcf", "gvcf"]);
    expect(catalog.findOption(command("gatk", "HaplotypeCaller"), "-ERC")?.value?.values?.map((v) => v.value)).toContain("GVCF");
    expect(catalog.findOption(command("gatk", "GenomicsDBImport"), "--genomicsdb-workspace-path")?.value).toMatchObject({
      type: "dir",
      formats: ["genomicsdb"],
    });
    expect(catalog.listArguments(command("bcftools", "view"))[0].value?.formats).toContain("gvcf");
  });

  test("GATK: the main inputs come first, and the somatic chain links its files", () => {
    expect(["--input", "--output", "--reference"]).toContain(first("gatk", "HaplotypeCaller"));
    expect(catalog.findOption(command("gatk", "Mutect2"), "--f1r2-tar-gz")?.value?.formats).toEqual(["f1r2"]);
    expect(catalog.findOption(command("gatk", "LearnReadOrientationModel"), "-I")?.value?.formats).toEqual(["f1r2"]);
    expect(catalog.findOption(command("gatk", "FilterMutectCalls"), "-ob-priors")?.value?.formats).toEqual(["orientation-model"]);
    expect(catalog.findOption(command("gatk", "ApplyBQSR"), "-bqsr")?.value?.formats).toEqual(["gatk-table"]);
  });

  test("bedtools: -a and -b first, intervals of any common format", () => {
    expect(first("bedtools", "intersect")).toBe("-a");
    expect(catalog.findOption(command("bedtools", "intersect"), "-b")?.value?.formats).toEqual(["bed", "gff", "gtf", "vcf", "bam"]);
    expect(catalog.findOption(command("bedtools", "genomecov"), "-g")?.value?.formats).toEqual(["genome", "fai"]);
    expect(catalog.findOption(command("bedtools", "merge"), "-o")?.value?.type).toBe("enum");
  });

  test("freebayes: the reference first; its symbol-named options are there", () => {
    expect(first("freebayes")).toBe("--fasta-reference");
    expect(catalog.findOption(command("freebayes"), "-=")?.canonicalName).toBe("--genotype-qualities");
    expect(catalog.findOption(command("freebayes"), "-&")?.canonicalName).toBe("--gvcf-dont-use-chunk");
  });

  test("VCFtools and VEP declare no help: their --help lists (almost) no option, so the Catalog's are kept", () => {
    const helps = (tool: string) => catalog.getToolQuery(tool)?.helps ?? [];
    expect(helps("vcftools")).toEqual([]);
    expect(helps("vep")).toEqual([]);
    expect(catalog.findOption(command("vcftools"), "--gzvcf")).toBeDefined();
    expect(catalog.findOption(command("vep"), "--offline")).toBeDefined();
  });

  test("snpEff annotates by default; SnpSift's filter reads its expression", () => {
    expect(catalog.listArguments(command("snpEff"))[0].name).toBe("genome_version");
    expect(catalog.findOption(command("snpEff", "ann"), "-csvStats")).toBeDefined();
    expect(catalog.listArguments(command("SnpSift", "filter"))[0].name).toBe("expression");
  });
});
