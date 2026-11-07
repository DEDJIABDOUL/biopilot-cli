// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The acceptance scenarios of spec annex C, through the engine's getSuggestions, in the annex C project:
// data/ctrl_R1|R2.fastq.gz, data/treat_R1|R2.fastq.gz, results/ and ref/genome.fa indexed by bwa — plus
// one BAM and one SAM, which scenario 9 needs to show anything. Scenarios 6 and 7 use fake fastp
// binaries of the two versions (conda environments). Scenario 12 (no network) holds by construction:
// nothing in BioPilot opens a connection.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

const project = tempDir();
for (const entry of [
  ".git/",
  "data/ctrl_R1.fastq.gz",
  "data/ctrl_R2.fastq.gz",
  "data/treat_R1.fastq.gz",
  "data/treat_R2.fastq.gz",
  "results/",
  "ref/genome.fa",
  ...[".amb", ".ann", ".bwt", ".pac", ".sa"].map((suffix) => `ref/genome.fa${suffix}`),
  "aln/sample.bam",
  "aln/sample.sam",
]) {
  const file = path.join(project, entry);
  if (entry.endsWith("/")) fs.mkdirSync(file, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
  }
}

/** A conda environment with a fake fastp of that version, printing its recorded help. */
const fastp = (version: string) => {
  const env = writeFakeCondaEnv(tempDir(), `fastp-${version}`, "fastp", version);
  const help = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", version, "root.txt"), "utf-8");
  writeFakeTool(env.bin, "fastp", { "--help": help, "--version": `fastp ${version}\n` });
  return env.bin;
};

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = path.join(tempDir(), "user.db");
  runtime = await import("../../../runtime/runtime.js");
});
afterEach(() => hideInstalledTools());

const names = async (line: string) => ((await runtime.getSuggestions(line, project, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

describe("annex C", () => {
  test("1. `fastp ` → --in1", async () => {
    expect((await names("fastp "))[0]).toBe("--in1");
  });

  test("2. `fastp --in1 ` → data/ctrl_R1.fastq.gz, then data/treat_R1.fastq.gz", async () => {
    expect((await names("fastp --in1 ")).slice(0, 2)).toEqual(["data/ctrl_R1.fastq.gz", "data/treat_R1.fastq.gz"]);
  });

  test("3. `fastp --in1 data/treat_R1.fastq.gz --in2 ` → data/treat_R2.fastq.gz", async () => {
    expect((await names("fastp --in1 data/treat_R1.fastq.gz --in2 "))[0]).toBe("data/treat_R2.fastq.gz");
  });

  test("4. `fastp -i data/treat_R1.fastq.gz --` → --in2, and --in1 absent", async () => {
    const suggested = await names("fastp -i data/treat_R1.fastq.gz --");
    expect(suggested[0]).toBe("--in2");
    expect(suggested).not.toContain("--in1");
  });

  test("5. `fastp --in1 data/ctrl_R1.fastq.gz --out1 ` → results/ctrl_R1.trimmed.fastq.gz", async () => {
    expect((await names("fastp --in1 data/ctrl_R1.fastq.gz --out1 "))[0]).toBe("results/ctrl_R1.trimmed.fastq.gz");
  });

  test("6 and 7. `fastp --de`: --dedup with fastp 0.23.4, not after switching to 0.20.1 in the same session", async () => {
    setSessionEnvironment({ PATH: fastp("0.23.4") });
    expect(await names("fastp --de")).toContain("--dedup");
    setSessionEnvironment({ PATH: fastp("0.20.1") });
    expect(await names("fastp --de")).not.toContain("--dedup");
  });

  test("8. `bwa mem ` → ref/genome.fa", async () => {
    expect((await names("bwa mem "))[0]).toBe("ref/genome.fa");
  });

  test("9. `samtools sort ` → BAM and SAM files first", async () => {
    expect((await names("samtools sort ")).slice(0, 2).sort()).toEqual(["aln/sample.bam", "aln/sample.sam"]);
  });

  test("10. `git ch` → checkout (no regression)", async () => {
    expect(await names("git ch")).toContain("checkout");
  });

  test("11. `sam` → samtools first", async () => {
    expect((await names("sam"))[0]).toBe("samtools");
  });
});
