// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// CLI smoke test: runs the real `biopilot info` entry point (from source, through tsx)
// against a Catalog compiled from test sources.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { FASTP, compileValid } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const catalogPath = compileValid({ "fastp.yml": FASTP });

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
      value: { type: "string" },
      default: null,
      rank: 95,
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
});
