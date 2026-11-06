// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// CLI smoke test on the real Catalog (ticket #12): runs `biopilot info` from source, through
// tsx, against a Catalog compiled from knowledge/ as shipped.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const catalogPath = path.join(tempDir(), "knowledge.db");
const compiled = compileCatalog({
  sourcesDir: path.join(repoRoot, "knowledge", "tools"),
  formatsPath: path.join(repoRoot, "knowledge", "formats.yml"),
  outputPath: catalogPath,
  biopilotVersion: "test",
});

const biopilot = (...args: string[]) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "info", ...args], {
    cwd: repoRoot,
    env: { ...process.env, BIOPILOT_CATALOG: catalogPath, FORCE_COLOR: "0" },
    encoding: "utf-8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

jest.setTimeout(60_000);

describe("biopilot info on the real Catalog", () => {
  test("the real knowledge/ compiles", () => {
    expect(compiled.ok ? [] : compiled.errors).toEqual([]);
  });

  test("`info --json fastp` exits 0 with fastp's options", () => {
    const { code, stdout } = biopilot("--json", "fastp");
    expect(code).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.tool.name).toBe("fastp");
    expect(output.options.length).toBeGreaterThan(0);
  });

  test("`info fastp --json` shows fastp's own --json option", () => {
    const { code, stdout } = biopilot("fastp", "--json");
    expect(code).toBe(0);
    expect(stdout).toMatch(/--json/);
    expect(() => JSON.parse(stdout)).toThrow();
  });

  test("`info unknowntool` exits 1", () => {
    expect(biopilot("unknowntool").code).toBe(1);
  });

  test("part B tools answer through their subcommands", () => {
    const sort = biopilot("--json", "samtools", "sort", "-o");
    expect(sort.code).toBe(0);
    expect(JSON.parse(sort.stdout).option.value).toMatchObject({ type: "file", format: "bam" });
    const mem = JSON.parse(biopilot("--json", "bwa", "mem").stdout);
    expect(mem.command.arguments.map((argument: { name: string }) => argument.name)).toEqual(["idxbase", "in1.fq", "in2.fq"]);
    expect(biopilot("bcftools", "call", "--multiallelic-caller").code).toBe(0);
    expect(biopilot("blastn", "-outfmt").code).toBe(0);
  });
});
