// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// CLI smoke test: runs the real `biopilot info` entry point (from source, through tsx)
// against a Catalog compiled from test sources.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import _Ajv2020 from "ajv/dist/2020.js";
import path from "node:path";
import url from "node:url";
import { FASTP, PACKER, RULED, SAMTOOLS, TRIMMER, compileValid } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
// fastp has its own `--json` option (its JSON report): `biopilot info fastp --json` must show it.
const FASTP_WITH_JSON = `${FASTP}  - names: ["-j", "--json"]\n    description: JSON report file\n`;
const catalogPath = compileValid({ "fastp.yml": FASTP_WITH_JSON, "samtools.yml": SAMTOOLS, "trimmer.yml": TRIMMER, "packer.yml": PACKER, "ruled.yml": RULED });

const biopilot = (...args: string[]) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "info", ...args], {
    cwd: repoRoot,
    env: { ...process.env, BIOPILOT_CATALOG: catalogPath, FORCE_COLOR: "0" },
    encoding: "utf-8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

jest.setTimeout(60_000);

describe("biopilot info", () => {
  test("--json before the tool gives the versioned JSON contract", () => {
    const { code, stdout } = biopilot("--json", "fastp");
    expect(code).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.format).toBe(1);
    expect(output.tool).toEqual({ name: "fastp", package: "fastp", description: "FASTQ preprocessing", platforms: ["illumina"] });
    expect(output.options[0]).toEqual({
      canonical_name: "--in1",
      aliases: ["-i", "--in1"],
      description: "read 1 input",
      value: { type: "string", format: null, optional: false, multiple: false, values: [], read_role: null },
      default: null,
      rank: 95,
      since: null,
      until: null,
      repeatable: false,
      hidden: false,
      deprecated: false,
      mate: null,
      derive: null,
      rules: [],
    });
  });

  test("words after the tool are the tool's options, never BioPilot's flags", () => {
    const short = biopilot("--json", "fastp", "-i");
    const long = biopilot("--json", "fastp", "--in1");
    expect(short.code).toBe(0);
    expect(JSON.parse(short.stdout).option.canonical_name).toBe("--in1");
    expect(JSON.parse(long.stdout)).toEqual(JSON.parse(short.stdout));
  });

  test("lists tools in plain text, without colour when not a TTY", () => {
    const { code, stdout } = biopilot();
    expect(code).toBe(0);
    expect(stdout).toMatch(/^fastp\s+illumina\s+FASTQ preprocessing$/m);
    expect(stdout).not.toContain("\u001b[");
  });

  test("unknown tool, unknown option and unavailable Catalog exit with 1", () => {
    expect(biopilot("nope").code).toBe(1);
    expect(biopilot("fastp", "--nope").code).toBe(1);
    const unavailable = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "info", "fastp"], {
      cwd: repoRoot,
      env: { ...process.env, BIOPILOT_CATALOG: path.join(repoRoot, "does-not-exist.db") },
      encoding: "utf-8",
    });
    expect(unavailable.status).toBe(1);
    expect(unavailable.stderr).toContain("unavailable");
  });

  test("`info fastp --json` is fastp's own --json option, not BioPilot's JSON output", () => {
    const { code, stdout } = biopilot("fastp", "--json");
    expect(code).toBe(0);
    expect(stdout).toContain("--json, -j");
    expect(stdout).toContain("JSON report file");
    expect(() => JSON.parse(stdout)).toThrow();
  });

  test("a subcommand path, then one of its options", () => {
    const { code, stdout } = biopilot("--json", "samtools", "sort", "-o");
    expect(code).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.command.path).toEqual(["sort"]);
    expect(output.option).toMatchObject({ canonical_name: "-o", description: "output file" });
  });

  test("a command shows its subcommands and positional arguments", () => {
    const root = JSON.parse(biopilot("--json", "samtools").stdout);
    expect(root.command.subcommands).toEqual([
      { name: "sort", description: "sort alignments" },
      { name: "view", description: "view and convert" },
      { name: "deep", description: null },
    ]);
    const view = JSON.parse(biopilot("--json", "samtools", "view").stdout);
    expect(view.command.arguments).toEqual([
      expect.objectContaining({ name: "in.bam", description: null, variadic: false }),
      expect.objectContaining({ name: "region", description: null, variadic: true }),
    ]);
    const text = biopilot("samtools", "view").stdout;
    expect(text).toMatch(/^usage: samtools view <in\.bam> <region>\.\.\.$/m);
  });

  test("an unknown subcommand exits with 1", () => {
    const { code, stderr } = biopilot("samtools", "nope");
    expect(code).toBe(1);
    expect(stderr).toContain('unknown command "samtools nope"');
  });

  test("JSON shows formats, read roles, mates and derived outputs", () => {
    const in2 = JSON.parse(biopilot("--json", "trimmer", "-I").stdout).option;
    expect(in2.value).toMatchObject({ type: "file", format: "fastq", read_role: 2 });
    expect(in2.mate).toBe("--in1");
    expect(JSON.parse(biopilot("--json", "trimmer", "-o").stdout).option.derive).toEqual({ from: "--in1", suffix: ".trimmed" });
    const mode = JSON.parse(biopilot("--json", "trimmer", "--mode").stdout).option.value;
    expect(mode.values).toEqual([
      { value: "fast", description: "quick and rough" },
      { value: "slow", description: null },
    ]);
    const args = JSON.parse(biopilot("--json", "trimmer").stdout).command.arguments;
    expect(args[1]).toEqual({
      name: "reads",
      description: null,
      variadic: true,
      value: { type: "file", format: "fastq", optional: false, multiple: false, values: [], read_role: 1 },
      default: "reads.fq",
      since: "1.0",
      until: null,
    });
  });

  test("text shows the same fields, readably", () => {
    const { code, stdout } = biopilot("trimmer");
    expect(code).toBe(0);
    expect(stdout).toMatch(/--in1, -i <fastq> .*R1, mate --in2/);
    expect(stdout).toMatch(/--in2, -I <fastq> .*R2, mate --in1/);
    expect(stdout).toMatch(/--out1, -o <fastq> .*derived from --in1 \+ \.trimmed/);
    expect(stdout).toContain("--index <salmon-index>");
    expect(stdout).toContain("--mode <fast|slow>");
    expect(stdout).toMatch(/--mode <fast\|slow> .*fast: quick and rough/);
    expect(stdout).toContain("--color[=<string>]");
    expect(stdout).toContain("--region <string>...");
    expect(stdout).toMatch(/--adapter <string> .*e\.g\. AGATCGGAAGAGC/);
    expect(stdout).toMatch(/--region .*repeatable/);
    expect(stdout).toMatch(/--dedup .*since 0\.22\.0/);
    expect(stdout).toMatch(/--old .*deprecated.*until 0\.20\.1/);
    expect(stdout).toMatch(/--debug-dump .*hidden/);
    expect(stdout).toMatch(/^usage: trimmer \[options\] <reference> <reads>\.\.\.$/m);
    expect(stdout).toMatch(/<reads>\.\.\. .*fastq, R1, default reads\.fq, since 1\.0/);
  });

  test("every JSON output form validates against the published contract", () => {
    const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", "info-output.schema.json"), "utf-8")),
    );
    for (const args of [["--json"], ["--json", "trimmer"], ["--json", "trimmer", "-o"], ["--json", "samtools", "view"], ["--json", "ruled"]]) {
      const output = JSON.parse(biopilot(...args).stdout);
      expect({ args, valid: validate(output), errors: validate.errors }).toEqual({ args, valid: true, errors: null });
    }
  });

  test("text shows positional arguments that are optional or take several values", () => {
    expect(biopilot("packer").stdout).toMatch(/^usage: packer <archive>\.\.\. \[<level>\]$/m);
  });

  test("an option's rules, in JSON and in text", () => {
    expect(JSON.parse(biopilot("--json", "ruled", "-I").stdout).option.rules).toEqual([
      { when: { used: ["--in1"], paired: true, platform: null, assay: null }, boost: 35 },
    ]);
    const { stdout } = biopilot("ruled");
    expect(stdout).toMatch(/--in2, -I .*\+35 when --in1 used and paired/);
    expect(stdout).toMatch(/--nanopore-mode .*\+40 when nanopore, -30 when illumina/);
    expect(stdout).toMatch(/--quant .*\+20 when rna-seq, \+5 always/);
  });
});
