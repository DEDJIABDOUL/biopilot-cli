// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot status`: the binary the shell would run for each Catalog Tool, and its version (ticket #41).
// Fake tools stand in for installed ones; nothing outside the test's folders is run.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { FASTP, SAMTOOLS, compileValid, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
// The repository's formats: the project section recognises annotations, read files, indexes.
const catalogPath = compileValid({ "fastp.yml": FASTP, "samtools.yml": SAMTOOLS }, fs.readFileSync(path.join(repoRoot, "knowledge", "formats.yml"), "utf-8"));
const userStore = path.join(tempDir(), "user.db"); // never created: status only reads it

const status = (env: Record<string, string>, ...args: string[]) => statusIn(repoRoot, env, ...args);
const statusIn = (cwd: string, env: Record<string, string>, ...args: string[]) => {
  const result = spawnSync(
    process.execPath,
    ["--import", path.join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs"), path.join(repoRoot, "src", "index.ts"), "status", ...args],
    {
      cwd,
      env: { HOME: process.env.HOME ?? "", BIOPILOT_CATALOG: catalogPath, BIOPILOT_USER_STORE: userStore, FORCE_COLOR: "0", ...env },
      encoding: "utf-8",
    },
  );
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

type StatusJson = {
  format: number;
  environment: { name: string | null; prefix: string | null };
  tools: { name: string; installed: boolean; binary: string | null; fingerprint: string | null; version: string | null; versionSource: string | null }[];
};
const json = (env: Record<string, string>) => {
  const { code, stdout, stderr } = status(env, "--json");
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  return JSON.parse(stdout) as StatusJson;
};
const tool = (report: StatusJson, name: string) => report.tools.find((t) => t.name === name);

jest.setTimeout(60_000);

describe("biopilot status", () => {
  const root = tempDir();
  const conda = writeFakeCondaEnv(root, "fastp-0.23.4", "fastp", "0.23.4");
  // The version command would say otherwise: conda-meta wins and nothing is run.
  writeFakeTool(conda.bin, "fastp", { "--version": "fastp 7.7.7\n" });
  const systemBin = path.join(root, "usr", "bin");
  writeFakeTool(systemBin, "samtools", { "--version": "samtools 1.21\nUsing htslib 1.21\n" });

  test("a conda tool: its binary, Fingerprint and the version from conda-meta, without running it", () => {
    const report = json({ PATH: `${conda.bin}:${systemBin}`, CONDA_PREFIX: conda.prefix, CONDA_DEFAULT_ENV: "fastp-0.23.4" });
    expect(report.format).toBe(1);
    expect(report.environment).toEqual({ name: "fastp-0.23.4", prefix: conda.prefix });
    expect(tool(report, "fastp")).toMatchObject({ installed: true, binary: path.join(conda.bin, "fastp"), version: "0.23.4", versionSource: "conda-meta" });
    expect(tool(report, "fastp")?.fingerprint).toContain(path.join(conda.bin, "fastp"));
  });

  test("a tool outside conda: the version from its declared version command", () => {
    expect(tool(json({ PATH: systemBin }), "samtools")).toMatchObject({ installed: true, version: "1.21", versionSource: "version-command" });
  });

  test("a tool not in PATH is reported as not installed", () => {
    expect(tool(json({ PATH: systemBin }), "fastp")).toEqual({
      name: "fastp",
      installed: false,
      binary: null,
      fingerprint: null,
      version: null,
      versionSource: null,
      profile: null,
    });
  });

  test("relative PATH entries are ignored: the current folder never decides what runs", () => {
    expect(tool(json({ PATH: `.:${path.relative(repoRoot, systemBin)}` }), "samtools")).toMatchObject({ installed: false });
  });

  test("a version command that prints nothing usable leaves the version unknown", () => {
    const bin = path.join(tempDir(), "bin");
    writeFakeTool(bin, "samtools", { "--version": "no version here\n" });
    expect(tool(json({ PATH: bin }), "samtools")).toMatchObject({ installed: true, version: null, versionSource: null });
  });

  test("the text output lists the environment and each tool", () => {
    const { code, stdout } = status({ PATH: `${conda.bin}:${systemBin}`, CONDA_PREFIX: conda.prefix, CONDA_DEFAULT_ENV: "fastp-0.23.4" });
    expect(code).toBe(0);
    expect(stdout).toMatch(/^environment: fastp-0\.23\.4 \(.*\)$/m);
    expect(stdout).toMatch(/^fastp +0\.23\.4 +conda-meta +no profile +.*bin\/fastp$/m);
    expect(stdout).toMatch(/^samtools +1\.21 +version command +no profile +.*bin\/samtools$/m);
  });

  test("an unavailable Catalog is an error", () => {
    const { code, stderr } = status({ PATH: systemBin, BIOPILOT_CATALOG: path.join(root, "missing.db") });
    expect(code).toBe(1);
    expect(stderr).toContain("the Catalog is unavailable");
  });

  test("the project around the current folder: root, platforms, assay, read pairs, config", () => {
    const project = tempDir();
    for (const file of ["Snakefile", "data/s_R1.fq", "data/s_R2.fq", "genes.gtf"]) {
      fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
      fs.writeFileSync(path.join(project, file), "");
    }
    const { code, stdout } = statusIn(path.join(project, "data"), { PATH: systemBin }, "--json");
    expect(code).toBe(0);
    expect(JSON.parse(stdout).project).toEqual({
      root: project,
      marker: "Snakefile",
      platforms: ["illumina"],
      assay: "rna-seq",
      readPairs: 1,
      config: null,
      truncated: false,
    });
    expect(statusIn(project, { PATH: systemBin }).stdout).toMatch(/^ {2}platforms: illumina, assay: rna-seq, read pairs: 1$/m);
  });
});
