// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The commands' runners called in-process (the CLI tests run them through the real entry point, in a child
// process): info, status and sync on a test Catalog, with fake tools.

import path from "node:path";
import { runInfo } from "../../../biopilot/cli/infoRunner.js";
import { runStatus } from "../../../biopilot/cli/statusRunner.js";
import { runSync } from "../../../biopilot/cli/syncRunner.js";
import { FASTP, SAMTOOLS, compileValid, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const catalogPath = compileValid({ "fastp.yml": FASTP, "samtools.yml": SAMTOOLS });
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) } };
};

beforeAll(() => {
  process.env.BIOPILOT_CATALOG = catalogPath;
  process.env.BIOPILOT_USER_STORE = path.join(tempDir(), "user.db");
});

describe("info", () => {
  test.each([
    [[], 0, "fastp"],
    [["fastp"], 0, "--in1"],
    [["--json", "fastp", "-i"], 0, '"canonical_name": "--in1"'],
    [["samtools", "sort"], 0, "sort"],
    [["--help"], 0, "Usage: biopilot info"],
  ])("info %j", (words, code, text) => {
    const { out, io } = capture();
    expect(runInfo(words, io)).toBe(code);
    expect(out.join("")).toContain(text);
  });

  test.each([[["nope"]], [["fastp", "--nope"]], [["samtools", "nope"]], [["--bad"]], [["fastp", "-i", "x"]]])("info %j is an error", (words) => {
    const { err, io } = capture();
    expect(runInfo(words, io)).toBe(1);
    expect(err.join("")).toContain("biopilot:");
  });
});

describe("status and sync", () => {
  test("sync computes, status reports, as text and JSON", async () => {
    const env = writeFakeCondaEnv(tempDir(), "x", "fastp", "1.0.0");
    writeFakeTool(env.bin, "fastp", { "--help": "  -i, --in1   read 1 (string [=])\n", "--version": "fastp 1.0.0\n" });
    const shellEnv = { PATH: env.bin, CONDA_PREFIX: env.prefix, CONDA_DEFAULT_ENV: "x" };
    const sync = capture();
    expect(await runSync({ ...sync.io, env: shellEnv, cwd: tempDir() })).toBe(0);
    expect(sync.out.join("")).toMatch(/fastp +computed +1\.0\.0/);
    const text = capture();
    expect(await runStatus({ json: false }, { ...text.io, env: shellEnv, cwd: tempDir() })).toBe(0);
    expect(text.out.join("")).toMatch(/fastp +1\.0\.0 +conda-meta +profile/);
    const json = capture();
    expect(await runStatus({ json: true }, { ...json.io, env: shellEnv, cwd: tempDir() })).toBe(0);
    expect(JSON.parse(json.out.join("")).tools[0]).toMatchObject({ name: "fastp", profile: "known" });
  });
});
