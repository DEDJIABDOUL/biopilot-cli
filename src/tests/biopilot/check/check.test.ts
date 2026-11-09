// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot check` (ticket #109): each rule against the real Catalog, positive and negative, a corpus of
// correct command lines that must give no Warning, and the CLI's exit codes and JSON contract.

import fs from "node:fs";
import path from "node:path";
import _Ajv2020 from "ajv/dist/2020.js";
import { checkLine, type CheckContext, type Warning } from "../../../biopilot/check/check.js";
import { tokenize } from "../../../biopilot/check/tokens.js";
import { availableCpus } from "../../../biopilot/check/cpus.js";
import { checkContext, runCheck } from "../../../biopilot/cli/checkRunner.js";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { parseHelp } from "../../../biopilot/profile/helpParser.js";
import { tempDir } from "../helpers.js";

const knowledge = path.resolve("knowledge");

/** The annex C project, plus what the other tools of the corpus read. */
const PROJECT_FILES = [
  "data/ctrl_R1.fastq.gz",
  "data/ctrl_R2.fastq.gz",
  "data/treat_R1.fastq.gz",
  "data/treat_R2.fastq.gz",
  "data/nano.fastq.gz",
  "ref/genome.fa",
  "ref/genome.fa.fai",
  "ref/genome.dict",
  ...[".amb", ".ann", ".bwt", ".pac", ".sa"].map((s) => `ref/genome.fa${s}`),
  ...[".1.bt2", ".2.bt2", ".3.bt2", ".4.bt2", ".rev.1.bt2", ".rev.2.bt2"].map((s) => `ref/bt2/genome${s}`),
  "ref/transcripts.fa",
  "ref/salmon_index/versionInfo.json",
  "ref/salmon_index/refseq.bin",
  "ref/star/genomeParameters.txt",
  "ref/annotation.gtf",
  "ref/known.vcf.gz",
  "results/ctrl.bam",
  "results/ctrl.sorted.bam",
  "results/ctrl.sorted.bam.bai",
  "results/ctrl.g.vcf.gz",
  "results/calls.vcf.gz",
  "regions.bed",
];

describe("biopilot check", () => {
  let catalog: Catalog;
  let project: string;
  let ctx: CheckContext;
  beforeAll(() => {
    const outputPath = path.join(tempDir(), "knowledge.db");
    const result = compileCatalog({
      sourcesDir: path.join(knowledge, "tools"),
      formatsPath: path.join(knowledge, "formats.yml"),
      outputPath,
      biopilotVersion: "test",
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const opened = openCatalog(outputPath);
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
    project = tempDir();
    for (const file of PROJECT_FILES) {
      fs.mkdirSync(path.join(project, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(project, file), "");
    }
    fs.mkdirSync(path.join(project, "results", "qc"), { recursive: true });
    ctx = { ...checkContext(project, { HOME: project }), cpus: { count: 8, source: "machine" } };
  });
  afterAll(() => catalog.close());

  const check = (line: string, context: CheckContext = ctx): Warning[] => {
    const result = checkLine(line, catalog, context);
    if (!result.ok) throw new Error(`not analysed: ${result.reason}`);
    return result.warnings;
  };
  const rules = (line: string) => check(line).map((w) => w.rule);

  describe("read-pair", () => {
    test("mates of two different samples", () => {
      const [warning] = check("fastp -i data/ctrl_R1.fastq.gz -I data/treat_R2.fastq.gz -o results/a.fq.gz -O results/b.fq.gz");
      expect(warning).toMatchObject({ rule: "read-pair", severity: "warning", tool: "fastp", subjects: ["-i", "-I"] });
      expect(warning.message).toContain("samples ctrl and treat");
    });
    test("read 1 and read 2 swapped", () => {
      expect(check("fastp --in1 data/ctrl_R2.fastq.gz --in2 data/ctrl_R1.fastq.gz")[0]).toMatchObject({ rule: "read-pair" });
      expect(check("fastp --in1 data/ctrl_R2.fastq.gz --in2 data/ctrl_R1.fastq.gz")[0].message).toContain("swapped");
    });
    test("positional mates (bwa mem)", () => {
      expect(rules("bwa mem ref/genome.fa data/ctrl_R1.fastq.gz data/treat_R2.fastq.gz")).toEqual(["read-pair"]);
    });
    test("comma-separated lists, pair by pair (bowtie2)", () => {
      expect(
        rules("bowtie2 -x ref/bt2/genome -1 data/ctrl_R1.fastq.gz,data/treat_R1.fastq.gz -2 data/ctrl_R2.fastq.gz,data/treat_R2.fastq.gz -S results/a.sam"),
      ).toEqual([]);
      expect(
        rules("bowtie2 -x ref/bt2/genome -1 data/ctrl_R1.fastq.gz,data/treat_R1.fastq.gz -2 data/treat_R2.fastq.gz,data/ctrl_R2.fastq.gz -S results/a.sam"),
      ).toEqual(["read-pair", "read-pair"]);
    });
    test("the right mate gives nothing", () => {
      expect(rules("fastp --in1 data/ctrl_R1.fastq.gz --in2 data/ctrl_R2.fastq.gz")).toEqual([]);
    });
  });

  describe("output-is-input", () => {
    test("an output equal to an input", () => {
      expect(rules("samtools sort -o results/ctrl.bam results/ctrl.bam")).toEqual(["output-is-input"]);
    });
    test("the same name in another folder is fine", () => {
      expect(rules("samtools sort -o results/qc/ctrl.bam results/ctrl.bam")).toEqual([]);
    });
  });

  describe("output-folder-missing", () => {
    test("an output file in a folder that does not exist", () => {
      const [warning] = check("samtools sort -o nowhere/ctrl.sorted.bam results/ctrl.bam");
      expect(warning).toMatchObject({ rule: "output-folder-missing", subjects: ["-o"] });
      expect(warning.message).toContain("nowhere");
    });
    test("an output folder the tool creates, in a folder that exists", () => {
      expect(rules("fastqc --outdir results/qc data/ctrl_R1.fastq.gz")).toEqual([]);
      expect(rules("spades.py -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -o results/spades")).toEqual([]);
    });
    test("an output folder whose parent does not exist", () => {
      expect(rules("spades.py -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -o nowhere/spades")).toEqual(["output-folder-missing"]);
    });
  });

  describe("input-missing", () => {
    test("an input that does not exist", () => {
      const [warning] = check("samtools index results/missing.bam");
      expect(warning).toMatchObject({ rule: "input-missing", subjects: ["<in.bam>"] });
    });
    test("standard input, URIs, patterns and variables are not checked", () => {
      expect(rules("samtools sort -o results/a.bam -")).toEqual([]);
      expect(rules("samtools index results/*.bam")).toEqual([]);
      expect(rules("samtools index $BAM")).toEqual([]);
      expect(rules("gatk GenotypeGVCFs -R ref/genome.fa -V gendb://results/db -O results/joint.vcf.gz")).toEqual([]);
    });
    test("~/ is the home folder", () => {
      expect(rules("samtools index ~/results/ctrl.sorted.bam")).toEqual([]);
    });
  });

  describe("reference-index", () => {
    test("a complete prefix index gives nothing", () => {
      expect(rules("bwa mem ref/genome.fa data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz")).toEqual([]);
    });
    test("an incomplete prefix index names the missing files", () => {
      fs.rmSync(path.join(project, "ref/genome.fa.sa"));
      try {
        const [warning] = check("bwa mem ref/genome.fa data/ctrl_R1.fastq.gz");
        expect(warning).toMatchObject({ rule: "reference-index", subjects: ["<idxbase>"] });
        expect(warning.message).toContain(".sa");
      } finally {
        fs.writeFileSync(path.join(project, "ref/genome.fa.sa"), "");
      }
    });
    test("no index at all", () => {
      expect(rules("bowtie2 -x ref/nothing -U data/nano.fastq.gz -S results/a.sam")).toEqual(["reference-index"]);
    });
    test("another layout of the same index (.bt2l) is not reported", () => {
      fs.mkdirSync(path.join(project, "ref/large"), { recursive: true });
      fs.writeFileSync(path.join(project, "ref/large/genome.1.bt2l"), "");
      expect(rules("bowtie2 -x ref/large/genome -U data/nano.fastq.gz -S results/a.sam")).toEqual([]);
    });
    test("an index folder without its marker", () => {
      fs.mkdirSync(path.join(project, "ref/empty_index"), { recursive: true });
      expect(rules("salmon quant -i ref/empty_index -l A -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -o results/quant")).toEqual(["reference-index"]);
      expect(rules("salmon quant -i ref/salmon_index -l A -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -o results/quant")).toEqual([]);
    });
    test("an index being built is an output, not a missing input", () => {
      expect(rules("salmon index -t ref/transcripts.fa -i ref/new_index")).toEqual([]);
    });
  });

  describe("threads-above-cpus", () => {
    test("more threads than CPUs", () => {
      const [warning] = check("bwa mem -t 64 ref/genome.fa data/ctrl_R1.fastq.gz");
      expect(warning).toMatchObject({ rule: "threads-above-cpus", subjects: ["-t"] });
      expect(warning.message).toBe("-t 64 asks for 64 threads; only 8 CPUs are available on this machine");
    });
    test("grouped short options and attached values (-ax map-ont, -t64)", () => {
      expect(rules("bwa mem -t64 ref/genome.fa data/ctrl_R1.fastq.gz data/treat_R2.fastq.gz")).toEqual(["read-pair", "threads-above-cpus"]);
      expect(rules("minimap2 -ax map-ont -t 64 ref/genome.fa data/nano.fastq.gz")).toEqual(["threads-above-cpus"]);
    });
    test("after an option the Catalog doesn't know, arguments are not read (no word taken for a file it is not)", () => {
      expect(rules("bwa mem --no-such-option ref/genome.fa data/ctrl_R1.fastq.gz")).toEqual([]);
      expect(rules("bwa mem --no-such-option x -t 64 ref/genome.fa")).toEqual(["threads-above-cpus"]);
    });
    test("as many threads as CPUs, and --opt=value forms", () => {
      expect(rules("bwa mem -t 8 ref/genome.fa data/ctrl_R1.fastq.gz")).toEqual([]);
      expect(rules("samtools sort --threads=16 -o results/a.bam results/ctrl.bam")).toEqual(["threads-above-cpus"]);
    });
    test("a SLURM allocation is named", () => {
      const slurm = { ...ctx, cpus: availableCpus({ SLURM_CPUS_PER_TASK: "4" }) };
      expect(check("minimap2 -t 8 -o results/a.sam ref/genome.fa data/nano.fastq.gz", slurm)[0].message).toContain("4 CPUs are available to this SLURM job");
    });
  });

  describe("option-version and option-deprecated (ticket #111)", () => {
    const recorded = (version: string) => parseHelp(fs.readFileSync(path.join(knowledge, "help", "fastp", version, "root.txt"), "utf-8"));
    const withFastp = (version: string | undefined, profile: ReturnType<typeof parseHelp> | undefined): CheckContext => ({
      ...ctx,
      installed: (tool) => (tool === "fastp" ? { version, profile: (command) => (command === "" ? profile : undefined) } : undefined),
    });
    const fastp = (options: string, context: CheckContext) => check(`fastp -i data/ctrl_R1.fastq.gz ${options}`, context);

    test("an option the installed version's Profile lacks", () => {
      const [warning] = fastp("--dedup", withFastp("0.20.1", recorded("0.20.1")));
      expect(warning).toMatchObject({ rule: "option-version", severity: "warning", subjects: ["--dedup"] });
      expect(warning.message).toBe("--dedup is not an option of fastp (fastp 0.20.1)");
      expect(fastp("--dedup", withFastp("0.23.4", recorded("0.23.4")))).toEqual([]);
    });
    test("an option neither the Catalog nor the Profile knows", () => {
      expect(fastp("--no-such-option", withFastp("0.23.4", recorded("0.23.4"))).map((w) => w.rule)).toEqual(["option-version"]);
    });
    test("any alias of a Catalog option present in the Profile is enough", () => {
      expect(fastp("-D", withFastp("0.23.4", recorded("0.23.4")))).toEqual([]);
    });
    test("without a Profile, the Catalog's version range decides", () => {
      expect(fastp("--dedup", withFastp("0.20.1", undefined))[0].message).toBe("--dedup appeared in 0.22.0; fastp 0.20.1 is installed");
      expect(fastp("--dedup", withFastp("0.23.4", undefined))).toEqual([]);
    });
    test("nothing without a Profile or a version, or when the tool is not installed", () => {
      expect(fastp("--dedup --no-such-option", withFastp(undefined, undefined))).toEqual([]);
      expect(fastp("--dedup --no-such-option", ctx)).toEqual([]);
    });
    test("a deprecated option is an info, which does not fail the check", () => {
      const [warning] = fastp("--cut_by_quality5", withFastp("0.23.4", recorded("0.23.4")));
      expect(warning).toMatchObject({ rule: "option-deprecated", severity: "info", subjects: ["--cut_by_quality5"] });
    });
  });

  test("correct command lines give no warning", () => {
    const corpus = [
      "fastp ",
      "fastp --in1 data/ctrl_R1.fastq.gz --in2 data/ctrl_R2.fastq.gz --out1 results/ctrl_R1.trimmed.fastq.gz --out2 results/ctrl_R2.trimmed.fastq.gz -w 4",
      "fastp -i data/treat_R1.fastq.gz -I data/treat_R2.fastq.gz -o results/treat_R1.fq.gz -O results/treat_R2.fq.gz --html results/treat.html",
      "bwa mem -t 8 ref/genome.fa data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz > results/ctrl.sam",
      "bwa mem ref/genome.fa data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz | samtools sort -@ 4 -o results/ctrl.sorted.bam -",
      "bwa index ref/genome.fa",
      "samtools sort -o results/ctrl.sorted.bam results/ctrl.bam",
      "samtools index results/ctrl.sorted.bam",
      "samtools view -b -q 30 -o results/ctrl.q30.bam results/ctrl.sorted.bam",
      "samtools flagstat results/ctrl.sorted.bam > results/ctrl.flagstat",
      "samtools faidx ref/genome.fa",
      "bowtie2 -p 8 -x ref/bt2/genome -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -S results/ctrl.sam",
      "bowtie2-build ref/genome.fa ref/bt2/genome",
      "minimap2 -ax map-ont -t 8 ref/genome.fa data/nano.fastq.gz -o results/nano.sam",
      "salmon quant -i ref/salmon_index -l A -1 data/ctrl_R1.fastq.gz -2 data/ctrl_R2.fastq.gz -p 8 -o results/ctrl_quant",
      "STAR --runThreadN 8 --genomeDir ref/star --readFilesIn data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz --readFilesCommand zcat --outFileNamePrefix results/ctrl_",
      "fastqc -t 4 -o results/qc data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz",
      "multiqc -o results/qc results",
      "cutadapt -a AGATCGGAAGAGC -A AGATCGGAAGAGC -o results/c_R1.fq.gz -p results/c_R2.fq.gz data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz",
      "bcftools mpileup -f ref/genome.fa results/ctrl.sorted.bam | bcftools call -mv -Oz -o results/calls.vcf.gz",
      "bcftools index results/calls.vcf.gz",
      "gatk HaplotypeCaller -R ref/genome.fa -I results/ctrl.sorted.bam -O results/ctrl.g.vcf.gz -ERC GVCF",
      "gatk BaseRecalibrator -R ref/genome.fa -I results/ctrl.sorted.bam --known-sites ref/known.vcf.gz -O results/recal.table",
      "bedtools intersect -a regions.bed -b ref/annotation.gtf > results/overlap.bed",
      "tabix -p vcf results/calls.vcf.gz",
      "mosdepth -t 4 results/ctrl results/ctrl.sorted.bam",
      "trimmomatic PE -threads 4 data/ctrl_R1.fastq.gz data/ctrl_R2.fastq.gz results/p1.fq.gz results/u1.fq.gz results/p2.fq.gz results/u2.fq.gz SLIDINGWINDOW:4:20",
      "OMP_NUM_THREADS=4 bwa mem ref/genome.fa data/ctrl_R1.fastq.gz",
      "picard MarkDuplicates -I results/ctrl.sorted.bam -O results/ctrl.dedup.bam -M results/ctrl.metrics.txt",
    ];
    const found = corpus.flatMap((line) => check(line).map((w) => `${line}\n  → ${w.rule}: ${w.message}`));
    expect(found).toEqual([]);
  });

  test("a line without a Catalog tool, or that cannot be read, is not analysed", () => {
    expect(checkLine("ls -la | grep x", catalog, ctx)).toEqual({ ok: false, reason: "no tool of the Catalog on this line" });
    expect(checkLine("fastp -i 'data/ctrl", catalog, ctx)).toMatchObject({ ok: false, reason: "unterminated single quote" });
  });

  describe("the CLI", () => {
    const run = async (args: string[]) => {
      let stdout = "";
      let stderr = "";
      const prev = process.env.BIOPILOT_CATALOG;
      process.env.BIOPILOT_CATALOG = catalog.path;
      try {
        const code = await runCheck(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), env: {}, cwd: project }, ctx);
        return { code, stdout, stderr };
      } finally {
        if (prev === undefined) delete process.env.BIOPILOT_CATALOG;
        else process.env.BIOPILOT_CATALOG = prev;
      }
    };
    test("exit 0 and a short note without a warning", async () => {
      expect(await run(["samtools index results/ctrl.sorted.bam"])).toMatchObject({ code: 0, stdout: "no warning (samtools index)\n" });
    });
    test("exit 1 and one line per warning", async () => {
      const { code, stdout } = await run(["samtools index results/missing.bam"]);
      expect(code).toBe(1);
      expect(stdout).toBe("⚠ <in.bam> results/missing.bam does not exist  [input-missing]\n");
    });
    test("exit 2 for a line that cannot be analysed, or none", async () => {
      expect((await run(["ls -la"])).code).toBe(2);
      expect((await run([])).code).toBe(2);
    });
    test("words after -- are the line", async () => {
      expect((await run(["--", "samtools", "index", "results/missing.bam"])).code).toBe(1);
    });
    test("--json follows its published schema", async () => {
      const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
      const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
        JSON.parse(fs.readFileSync(path.resolve("schemas", "check-output.schema.json"), "utf-8")),
      );
      for (const line of ["fastp -i data/ctrl_R1.fastq.gz -I data/treat_R2.fastq.gz", "samtools index results/ctrl.sorted.bam", "ls"]) {
        const { stdout } = await run(["--json", line]);
        const output = JSON.parse(stdout);
        expect(validate(output) ? [] : validate.errors).toEqual([]);
        expect(output.format).toBe(1);
      }
    });
  });
});

describe("tokenize", () => {
  test("quotes, escapes and comments", () => {
    expect(tokenize(`fastp -i "my reads_R1.fq" --adapter 'A G' a\\ b # comment`)).toEqual({
      ok: true,
      commands: [["fastp", "-i", "my reads_R1.fq", "--adapter", "A G", "a b"]],
    });
  });
  test("pipelines and lists are split; redirections and their targets dropped", () => {
    expect(tokenize("bwa mem ref.fa r1.fq 2> log | samtools sort -o out.bam - && echo done; ls >x 2>&1")).toEqual({
      ok: true,
      commands: [["bwa", "mem", "ref.fa", "r1.fq"], ["samtools", "sort", "-o", "out.bam", "-"], ["echo", "done"], ["ls"]],
    });
  });
  test("unterminated quotes", () => {
    expect(tokenize(`fastp -i "x`)).toEqual({ ok: false, reason: "unterminated double quote" });
  });
});

describe("availableCpus", () => {
  const cgroup = (files: Record<string, string>) => {
    const root = tempDir();
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
    return root;
  };
  test("SLURM_CPUS_PER_TASK first", () => {
    expect(availableCpus({ SLURM_CPUS_PER_TASK: "6" }, cgroup({ "cpu.max": "200000 100000" }), 64)).toEqual({ count: 6, source: "SLURM_CPUS_PER_TASK" });
  });
  test("then the cgroup quota, v2 or v1, when below the machine's CPUs", () => {
    expect(availableCpus({}, cgroup({ "cpu.max": "250000 100000\n" }), 64)).toEqual({ count: 3, source: "cgroup" });
    expect(availableCpus({}, cgroup({ "cpu/cpu.cfs_quota_us": "400000", "cpu/cpu.cfs_period_us": "100000" }), 64)).toEqual({ count: 4, source: "cgroup" });
  });
  test("else the machine", () => {
    expect(availableCpus({}, cgroup({ "cpu.max": "max 100000" }), 12)).toEqual({ count: 12, source: "machine" });
    expect(availableCpus({ SLURM_CPUS_PER_TASK: "x" }, cgroup({}), 12)).toEqual({ count: 12, source: "machine" });
  });
});
