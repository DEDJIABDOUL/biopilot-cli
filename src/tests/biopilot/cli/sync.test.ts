// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot sync`: the Profiles of the active environment's Catalog Tools, computed ahead of time into the
// User store (ticket #42). Fake tools print the real recorded helps of knowledge/help.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { SAMTOOLS, compileValid, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const recorded = (tool: string, version: string, file = "root.txt") => fs.readFileSync(path.join(repoRoot, "knowledge", "help", tool, version, file), "utf-8");
const FASTP = fs.readFileSync(path.join(repoRoot, "knowledge", "tools", "fastp.yml"), "utf-8");
const FORMATS = fs.readFileSync(path.join(repoRoot, "knowledge", "formats.yml"), "utf-8");
const catalogPath = compileValid({ "fastp.yml": FASTP, "samtools.yml": SAMTOOLS }, FORMATS);

const biopilot = (env: Record<string, string>, ...args: string[]) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), ...args], {
    cwd: repoRoot,
    env: { HOME: process.env.HOME ?? "", BIOPILOT_CATALOG: catalogPath, FORCE_COLOR: "0", ...env },
    encoding: "utf-8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** A conda environment with a fake fastp of that version, printing its recorded help. */
const fastpEnv = (root: string, version: string) => {
  const env = writeFakeCondaEnv(root, `fastp-${version}`, "fastp", version);
  writeFakeTool(env.bin, "fastp", { "--help": recorded("fastp", version), "--version": `fastp ${version}\n` });
  return env;
};

jest.setTimeout(60_000);

describe("biopilot sync", () => {
  test("computes the Profile of each installed Catalog Tool and reports what it did", () => {
    const root = tempDir();
    const store = path.join(root, "data", "user.db");
    const env = fastpEnv(root, "0.23.4");
    const { code, stdout } = biopilot({ PATH: env.bin, BIOPILOT_USER_STORE: store }, "sync");
    expect(code).toBe(0);
    expect(stdout).toMatch(/^fastp +computed +0\.23\.4$/m);
    expect(stdout).toMatch(/^samtools +not installed$/m);

    const opened = openUserStore({ create: false, file: store });
    const profile = opened?.getProfile("fastp", "0.23.4", "");
    opened?.close();
    expect(profile?.options.some((option) => option.names.includes("--dedup"))).toBe(true);
    expect(fs.statSync(store).mode & 0o777).toBe(0o600);
  });

  test("a second sync finds the Profile already known; status says so", () => {
    const root = tempDir();
    const store = path.join(root, "user.db");
    const env = fastpEnv(root, "0.20.1");
    biopilot({ PATH: env.bin, BIOPILOT_USER_STORE: store }, "sync");
    expect(biopilot({ PATH: env.bin, BIOPILOT_USER_STORE: store }, "sync").stdout).toMatch(/^fastp +known +0\.20\.1$/m);
    const status = JSON.parse(biopilot({ PATH: env.bin, BIOPILOT_USER_STORE: store }, "status", "--json").stdout);
    expect(status.tools.find((tool: { name: string }) => tool.name === "fastp")).toMatchObject({ version: "0.20.1", profile: "known" });
  });

  test("one Profile per version, shared by every environment that installs it", () => {
    const root = tempDir();
    const store = path.join(root, "user.db");
    biopilot({ PATH: fastpEnv(root, "0.23.4").bin, BIOPILOT_USER_STORE: store }, "sync");
    const other = writeFakeCondaEnv(path.join(root, "other"), "again", "fastp", "0.23.4");
    writeFakeTool(other.bin, "fastp", {}); // would print nothing: it must not be asked
    expect(biopilot({ PATH: other.bin, BIOPILOT_USER_STORE: store }, "sync").stdout).toMatch(/^fastp +known +0\.23\.4$/m);
  });

  test("subcommands get their own Profile; a tool outside conda is versioned by its version command", () => {
    const root = tempDir();
    const store = path.join(root, "user.db");
    const bin = path.join(root, "bin");
    writeFakeTool(bin, "samtools", { "--version": "samtools 1.25\n", sort: recorded("samtools", "1.25", "sort.txt") });
    expect(biopilot({ PATH: bin, BIOPILOT_USER_STORE: store }, "sync").stdout).toMatch(/^samtools +computed +1\.25$/m);
    const opened = openUserStore({ create: false, file: store });
    expect(opened?.getProfile("samtools", "1.25", "sort")?.options.map((option) => option.names[0])).toContain("-o");
    opened?.close();
  });

  test("a tool whose help cannot be read is reported as failed, and nothing is stored", () => {
    const root = tempDir();
    const store = path.join(root, "user.db");
    const env = writeFakeCondaEnv(root, "broken", "fastp", "0.23.4");
    writeFakeTool(env.bin, "fastp", {}); // prints nothing for --help
    expect(biopilot({ PATH: env.bin, BIOPILOT_USER_STORE: store }, "sync").stdout).toMatch(/^fastp +failed +0\.23\.4$/m);
    const opened = openUserStore({ create: false, file: store });
    expect(opened?.getProfile("fastp", "0.23.4", "")).toBeUndefined();
    opened?.close();
  });

  test("a User store that cannot be created is an error", () => {
    const file = path.join(tempDir(), "user.db");
    fs.mkdirSync(file);
    const { code, stderr } = biopilot({ PATH: "/nonexistent", BIOPILOT_USER_STORE: file }, "sync");
    expect(code).toBe(1);
    expect(stderr).toContain("the User store is unavailable");
  });
});
