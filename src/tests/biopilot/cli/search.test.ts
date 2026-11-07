// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot search "<text>"` (ticket #74): options of the Catalog and of learned tools whose names or
// descriptions match every word.

import path from "node:path";
import { runSearch } from "../../../biopilot/cli/searchRunner.js";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { compileRepositoryCatalog, tempDir } from "../helpers.js";

const store = path.join(tempDir(), "user.db");
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t), env: {}, cwd: tempDir() } };
};

beforeAll(() => {
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = store;
  // A learned tool with one Profile.
  const opened = openUserStore({ create: true, file: store });
  opened?.putLearnedTool({
    name: "mytool",
    description: null,
    query: { package: "mytool", versionArgs: [], versionRegex: "", helps: [{ path: [], args: ["--help"] }] },
    subcommands: [],
    learnedAt: 0,
  });
  opened?.putProfile({
    tool: "mytool",
    version: "fp:x",
    command: "",
    options: [{ names: ["-a", "--adapter-file"], takesValue: true, description: "trim the adapters listed in FILE" }],
    fingerprint: "x",
    createdAt: 0,
  });
  opened?.close();
});

describe("biopilot search", () => {
  test("finds Catalog options by what they do, best first", async () => {
    const { out, io } = capture();
    expect(await runSearch(["duplicated", "reads"], io)).toBe(0);
    expect(out.join("")).toMatch(/^fastp +--dedup, -D +/m);
  });

  test("every word must match; the last one may be a prefix", async () => {
    const { out, io } = capture();
    await runSearch(["extra", "thread"], io);
    expect(out.join("")).toMatch(/^samtools sort +--threads, -@/m);
  });

  test("learned tools' options are searched too", async () => {
    const { out, io } = capture();
    await runSearch(["adapter"], io);
    expect(out.join("")).toMatch(/^mytool +--adapter-file, -a +trim the adapters/m);
    expect(out.join("")).toMatch(/^fastp /m);
  });

  test("--tool keeps one tool; --json gives the results as data", async () => {
    const { out, io } = capture();
    expect(await runSearch(["--json", "--tool", "fastp", "adapter"], io)).toBe(0);
    const results = JSON.parse(out.join("")).results as { tool: string; source: string; names: string[] }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.tool === "fastp" && result.source === "catalog")).toBe(true);
  });

  test("no match is not an error; no text is", async () => {
    const none = capture();
    expect(await runSearch(["zzzzunknown"], none.io)).toBe(0);
    expect(none.out.join("")).toContain('no option matches "zzzzunknown"');
    const empty = capture();
    expect(await runSearch([], empty.io)).toBe(1);
    expect(empty.err.join("")).toContain("what to search");
  });
});
