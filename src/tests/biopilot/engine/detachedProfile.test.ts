// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// An installed Tool whose Profile is unknown gets it computed by a detached process (ADR-0002, ticket #45):
// the suggestion never waits, the following ones use the Profile once it lands, and the tool runs once.

import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, tempDir, writeFakeTool, outsideAnyProject } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const recorded = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", "0.23.4", "root.txt"), "utf-8");
const helpWithNewFlag = `${recorded}      --brand-new-flag                 a flag this release added\n`;

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
const root = tempDir();

beforeAll(async () => {
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = path.join(root, "user.db"); // does not exist yet: the child creates it
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string, bin: string) => {
  setSessionEnvironment({ PATH: bin });
  return ((await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash))?.suggestions ?? []).map((s) => s.name);
};
const helpCalls = (log: string) =>
  fs.existsSync(log)
    ? fs
        .readFileSync(log, "utf-8")
        .split("\n")
        .filter((line) => line === "--help").length
    : 0;

/** Asks again until `done` holds, the way a user keeps typing; fails after `timeoutMs`. */
const eventually = async (ask: () => Promise<boolean>, timeoutMs = 20_000) => {
  const start = Date.now();
  while (!(await ask())) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

jest.setTimeout(60_000);

describe("detached Profile computation", () => {
  test("the first suggestion shows the Catalog at once; the Profile's options follow; the tool ran once", async () => {
    const bin = path.join(root, "a", "bin");
    const log = path.join(root, "a.log");
    writeFakeTool(bin, "fastp", { "--help": helpWithNewFlag, "--version": "fastp 0.24.0\n" }, log);

    expect(await names("fastp --brand", bin)).toEqual([]); // nothing waited for: the Catalog has no such option
    await eventually(async () => (await names("fastp --brand", bin)).includes("--brand-new-flag"));
    for (let i = 0; i < 5; i++) await names("fastp --", bin);
    expect(helpCalls(log)).toBe(1);
  });

  test("a tool whose help gives nothing is tried once, never again in the session", async () => {
    const bin = path.join(root, "b", "bin");
    const log = path.join(root, "b.log");
    writeFakeTool(bin, "fastp", { "--version": "fastp 0.24.1\n" }, log); // --help prints nothing
    await names("fastp --", bin);
    await eventually(async () => helpCalls(log) === 1);
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300)); // past the recheck delay each time
      expect(await names("fastp --de", bin)).toContain("--dedup"); // the Catalog meanwhile
    }
    expect(helpCalls(log)).toBe(1);
  });
});
