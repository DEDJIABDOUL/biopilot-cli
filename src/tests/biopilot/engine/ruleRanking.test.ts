// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Context rules boost options in the engine's ranking: priority = Rank + boosts of the rules that hold.

import os from "node:os";
import { Shell } from "../../../utils/shell.js";
import { compileValid } from "../helpers.js";

const BOOSTED = `
name: boosted
version: { args: ["--version"], regex: 'v(\\S+)' }
options:
  - names: ["--a"]
    rank: 80
  - names: ["--b"]
    rank: 60
    rules:
      - when: { used: ["--c"] }
        boost: 40
  - names: ["--c"]
    rank: 50
  - names: ["--d"]
    rank: 70
    rules:
      - when: { used: ["-C"] }
        boost: -50
  - names: ["--e"]
    rank: 55
    rules:
      - when: { platform: nanopore }
        boost: 100
  - names: ["--f"]
    rank: 90
    deprecated: true
    rules:
      - when: { used: ["--c"] }
        boost: 50
  - names: ["-C", "--c-alias-target"]
    rank: 10
`;

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  process.env.BIOPILOT_CATALOG = compileValid({ "boosted.yml": BOOSTED });
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string) => ((await runtime.getSuggestions(line, os.tmpdir(), Shell.Bash))?.suggestions ?? []).map((s) => s.name);

test("without the options a rule depends on, options keep their Rank", async () => {
  expect(await names("boosted --")).toEqual(["--a", "--d", "--b", "--e", "--c", "--c-alias-target", "--f"]);
});

test("a rule whose options are on the line adds its boost; a negative boost lowers", async () => {
  expect(await names("boosted --c --")).toEqual(["--b", "--a", "--d", "--e", "--c-alias-target", "--f"]);
  expect(await names("boosted -C --")).toEqual(["--a", "--b", "--e", "--c", "--d", "--f"]);
});

test("rules on the project (platform, paired, assay) don't fire in phase 2", async () => {
  expect((await names("boosted --")).indexOf("--e")).toBe(3);
});

test("a deprecated option stays last, even when its rules hold", async () => {
  expect((await names("boosted --c --")).at(-1)).toBe("--f");
});
