// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Usage (ticket #51): options the user accepts are counted under their canonical name (M12) and ranked
// higher, by at most +15. The engine reports an accepted suggestion through recordAcceptedSuggestion.

import path from "node:path";
import { recordAcceptedSuggestion } from "../../../biopilot/engine/usage.js";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, outsideAnyProject, tempDir } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
const store = path.join(tempDir(), "user.db");

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = store;
  runtime = await import("../../../runtime/runtime.js");
});

const priority = async (line: string, name: string) =>
  ((await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash))?.suggestions ?? []).find((s) => s.name === name)?.priority;
const accept = (line: string, name: string) => recordAcceptedSuggestion(line, { name });
const counts = (tool: string, command: string) => {
  const opened = openUserStore({ create: false, file: store });
  const result = opened?.usageCounts(tool, command);
  opened?.close();
  return result;
};

describe("usage", () => {
  test("an accepted option is counted under its canonical name, aliases together, per command", () => {
    accept("fastp -", "-D");
    accept("fastp --in1 x --", "--dedup");
    accept("samtools sort -", "-o");
    expect(counts("fastp", "")).toEqual(new Map([["--dedup", 2]]));
    expect(counts("samtools", "sort")).toEqual(new Map([["-o", 1]]));
  });

  test("each use adds 3 to the option's priority, up to +15", async () => {
    const before = await priority("fastp --", "--trim_poly_x");
    accept("fastp --", "--trim_poly_x");
    expect(await priority("fastp --", "--trim_poly_x")).toBe((before ?? 0) + 3);
    for (let i = 0; i < 10; i++) accept("fastp --", "--trim_poly_x");
    expect(await priority("fastp --", "--trim_poly_x")).toBe((before ?? 0) + 15);
  });

  test("subcommands, values and tools outside the Catalog are not counted", () => {
    accept("samtools ", "sort");
    accept("fastp --compression ", "4");
    accept("git ", "--version");
    expect(counts("samtools", "")).toEqual(new Map());
    expect(counts("git", "")).toEqual(new Map());
  });
});

describe("usage in a User store made before usage existed", () => {
  test("the table is added when the store is opened, and counting works", async () => {
    const { default: Database } = await import("better-sqlite3");
    const file = path.join(tempDir(), "user.db");
    const old = new Database(file);
    old.exec(
      "CREATE TABLE profiles (tool TEXT, version TEXT, command TEXT, options TEXT, fingerprint TEXT, created_at INTEGER, PRIMARY KEY (tool, version, command))",
    );
    old.close();
    const opened = openUserStore({ create: false, file });
    opened?.addUsage("fastp", "", "--dedup");
    expect(opened?.usageCounts("fastp", "")).toEqual(new Map([["--dedup", 1]]));
    opened?.close();
  });
});
