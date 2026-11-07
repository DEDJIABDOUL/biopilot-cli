// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot complete "<line>"`: the engine's suggestions for a typed line, as JSON, without a terminal (M8).

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { unpackResources } from "../../../utils/node.js";
import { compileRepositoryCatalog } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const dataHome = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-complete-"));

const complete = (line: string, env: Record<string, string> = {}) => {
  const run = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "complete", line], {
    cwd: repoRoot,
    env: { ...process.env, XDG_DATA_HOME: dataHome, XDG_CONFIG_HOME: path.join(dataHome, "config"), ...env },
    encoding: "utf-8",
  });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
};

jest.setTimeout(60_000);

beforeAll(async () => {
  // The Fig specs the engine reads, unpacked into a temporary data directory (never the user's home).
  await unpackResources(path.join(dataHome, "biopilot"));
});

describe("biopilot complete", () => {
  test("prints the suggestions for a typed line as JSON", () => {
    const { code, stdout } = complete("git ch");
    expect(code).toBe(0);
    expect(JSON.parse(stdout).suggestions.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(["checkout"]));
  });

  test.each([["fastp --"], ["no-such-command --x"]])("prints an empty result instead of crashing when there is nothing to suggest: %s", (line) => {
    const { code, stdout, stderr } = complete(line, { BIOPILOT_CATALOG: path.join(dataHome, "no-catalog.db") });
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout)).toEqual({ suggestions: [] });
  });

  test("reads the configuration like a session: an invalid config is reported", () => {
    const configDir = path.join(dataHome, "bad-config", "biopilot");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "rc.toml"), "this is = = not toml");
    const { code, stderr } = complete("git ch", { XDG_CONFIG_HOME: path.join(dataHome, "bad-config") });
    expect(code).not.toBe(0);
    expect(stderr).toContain("invalid toml");
  });

  test("`fastp --` gives fastp's options from the Catalog, --in1 first", () => {
    const { code, stdout } = complete("fastp --", { BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).suggestions[0]).toMatchObject({ name: "--in1", allNames: ["--in1", "-i"], priority: 95 });
  });
});
