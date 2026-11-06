// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { ALIGNER, ALIGNER_FORMATS, compileValid } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const catalogPath = compileValid({ "aligner.yml": ALIGNER }, ALIGNER_FORMATS);
const biopilot = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "info", ...args], {
    cwd: repoRoot,
    env: { ...process.env, BIOPILOT_CATALOG: catalogPath, FORCE_COLOR: "0" },
    encoding: "utf-8",
  });

jest.setTimeout(60_000);

describe("biopilot info: several formats, argument mates", () => {
  test("JSON keeps `format` (the first) and adds `formats` (all of them)", () => {
    const value = JSON.parse(biopilot("--json", "aligner", "sort", "-o").stdout).option.value;
    expect(value).toMatchObject({ format: "bam", formats: ["bam", "sam"] });
  });

  test("text shows every accepted format, and argument mates", () => {
    expect(biopilot("aligner", "sort").stdout).toContain("-o <bam|sam>");
    const mem = biopilot("aligner", "mem").stdout;
    expect(mem).toMatch(/<in1> .*fastq, R1, mate in2/);
    expect(mem).toMatch(/<in2> .*fastq, R2, mate in1/);
    expect(JSON.parse(biopilot("--json", "aligner", "mem").stdout).command.arguments[1].mate).toBe("in2");
  });
});
