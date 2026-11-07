// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// An option the spec doesn't know (e.g. a brand-new flag) doesn't stop suggestions for the rest of the line (M5).

import { Shell } from "../../../utils/shell.js";
import { SAMTOOLS, TRIMMER, compileValid, hideInstalledTools, outsideAnyProject } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileValid({ "trimmer.yml": TRIMMER, "samtools.yml": SAMTOOLS });
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string) => ((await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

test("an unknown option is skipped and the options keep coming", async () => {
  expect(await names("trimmer --brand-new-flag --")).toEqual(expect.arrayContaining(["--in1", "--mode"]));
});

test("after a known option and its value", async () => {
  expect(await names("trimmer --mode fast --brand-new-flag --")).toEqual(expect.arrayContaining(["--in1"]));
});

test("inside a subcommand", async () => {
  expect(await names("samtools sort --brand-new-flag -")).toEqual(expect.arrayContaining(["-o", "--threads"]));
});

test("a value after an unknown option completes as usual", async () => {
  expect(await names("trimmer --brand-new-flag --mode ")).toEqual(["fast", "slow"]);
});
