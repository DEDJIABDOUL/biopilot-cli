// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The project feeds the ranking (ticket #50): context rules on read pairs, platform and assay, the M6
// platform bonus of Tool names, and the reference of .biopilot.toml.

import fs from "node:fs";
import path from "node:path";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, tempDir } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

const project = (entries: string[], content: Record<string, string> = {}) => {
  const root = tempDir();
  for (const entry of [".git/", ...entries]) {
    const file = path.join(root, entry);
    if (entry.endsWith("/")) fs.mkdirSync(file, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content[entry] ?? "");
    }
  }
  return root;
};
const paired = project(["data/treat_R1.fastq.gz", "data/treat_R2.fastq.gz"]);
const single = project(["data/reads.fastq.gz"]);
const nanopore = project(["run/a.pod5", "reads.fastq.gz"]);

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  runtime = await import("../../../runtime/runtime.js");
});

const suggest = async (line: string, cwd: string) => (await runtime.getSuggestions(line, cwd, Shell.Bash))?.suggestions ?? [];
const names = async (line: string, cwd: string) => (await suggest(line, cwd)).map((s) => s.name);
const priority = async (line: string, cwd: string, name: string) => (await suggest(line, cwd)).find((s) => s.name === name)?.priority;

describe("the project feeds the ranking", () => {
  test("annex C 4: `fastp -i data/treat_R1.fastq.gz --` → --in2 first, --in1 absent, in a paired project", async () => {
    const suggested = await names("fastp -i data/treat_R1.fastq.gz --", paired);
    expect(suggested[0]).toBe("--in2");
    expect(suggested).not.toContain("--in1");
  });

  test("a rule on unpaired reads fires in a single-end project only", async () => {
    expect(await priority("fastp --", paired, "--in2")).toBe(60);
    expect(await priority("fastp --", single, "--in2")).toBe(40);
  });

  test("a rule on the platform fires in a nanopore project only", async () => {
    expect(await priority("fastqc --", single, "--nogroup")).toBe(35);
    expect(await priority("fastqc --", nanopore, "--nogroup")).toBe(15);
  });

  test("M6: Tool names of the project's platform come first", async () => {
    expect((await names("b", single))[0]).toBe("bcftools");
    expect((await names("b", paired))[0]).toBe("bwa");
  });

  test("the reference of .biopilot.toml comes first for a reference value", async () => {
    const configured = project(["ref/a.fa", "ref/b.fa", ".biopilot.toml"], { ".biopilot.toml": 'reference = "ref/b.fa"\n' });
    expect((await names("bwa index ", configured))[0]).toBe("ref/b.fa");
    expect((await names("bwa index ", project(["ref/a.fa", "ref/b.fa"])))[0]).toBe("ref/a.fa");
  });
});
