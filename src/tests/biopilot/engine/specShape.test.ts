// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Subcommands, positional arguments and values of Catalog tools, as the engine suggests them.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Shell } from "../../../utils/shell.js";
import { SAMTOOLS, TRIMMER, compileValid } from "../helpers.js";

const DEPRECATED = `
name: legacy
version: { args: ["--version"], regex: 'v(\\S+)' }
options:
  - names: ["--old-way"]
    rank: 99
    deprecated: true
  - names: ["--new-way"]
    rank: 40
`;

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
let cwd: string;

beforeAll(async () => {
  process.env.BIOPILOT_CATALOG = compileValid({ "samtools.yml": SAMTOOLS, "trimmer.yml": TRIMMER, "legacy.yml": DEPRECATED });
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-project-"));
  fs.writeFileSync(path.join(cwd, "reads.fq"), "");
  fs.mkdirSync(path.join(cwd, "idx"));
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string) => ((await runtime.getSuggestions(line, cwd, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

describe("subcommands", () => {
  test("`samtools ` suggests its subcommands", async () => {
    expect(await names("samtools ")).toEqual(expect.arrayContaining(["sort", "view", "deep"]));
  });

  test("`samtools sort -` suggests sort's own options, not the root's", async () => {
    expect(await names("samtools sort -")).toEqual(["-o", "--threads"]);
  });

  test("nested subcommands at any depth", async () => {
    expect(await names("samtools deep deeper --")).toEqual(["--flag"]);
  });
});

describe("values", () => {
  test("enum values are suggested", async () => {
    expect(await names("trimmer --mode ")).toEqual(["fast", "slow"]);
  });

  test("suggested values of a non-enum option are offered", async () => {
    expect(await names("trimmer --adapter ")).toEqual(expect.arrayContaining(["AGATCGGAAGAGC"]));
  });

  test("an option taking a file suggests files", async () => {
    expect(await names("trimmer --in1 ")).toEqual(expect.arrayContaining(["reads.fq"]));
  });

  test("an option taking a folder suggests folders only", async () => {
    const suggested = await names("trimmer --index ");
    expect(suggested).toEqual(expect.arrayContaining(["idx"]));
    expect(suggested).not.toContain("reads.fq");
  });

  test("a positional argument taking a file suggests files", async () => {
    expect(await names("trimmer ")).toEqual(expect.arrayContaining(["reads.fq"]));
  });
});

describe("option forms", () => {
  test("hidden options are never suggested, but still recognised on the line", async () => {
    expect(await names("trimmer --")).not.toContain("--debug-dump");
    expect(await names("trimmer --debug-dump --")).toEqual(expect.arrayContaining(["--in1"]));
  });

  test("deprecated options come last, whatever their rank", async () => {
    expect(await names("legacy --")).toEqual(["--new-way", "--old-way"]);
  });
});
