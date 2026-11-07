// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Bio tools take options after their positional arguments (`samtools sort in.bam -o out.bam`): once the
// arguments are typed, options keep coming (M11), as Fig itself does.

import os from "node:os";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string) => ((await runtime.getSuggestions(line, os.tmpdir(), Shell.Bash))?.suggestions ?? []).map((s) => s.name);

describe("options after the positional arguments", () => {
  test("`samtools sort in.bam -` suggests sort's options", async () => {
    expect(await names("samtools sort in.bam -")).toEqual(expect.arrayContaining(["-o", "--threads"]));
  });

  test("`bwa mem ref r1.fq r2.fq -` suggests mem's options", async () => {
    expect(await names("bwa mem ref r1.fq r2.fq -")).toEqual(expect.arrayContaining(["-t", "-o"]));
  });

  test("an option already on the line is still not suggested again", async () => {
    expect(await names("samtools sort -o out.bam in.bam -")).not.toContain("-o");
  });

  test("once the arguments are all typed, only options are suggested: no more files", async () => {
    const suggested = await runtime.getSuggestions("samtools sort in.bam ", os.tmpdir(), Shell.Bash);
    expect(suggested?.suggestions.map((s) => s.name)).toEqual(expect.arrayContaining(["-o"]));
    expect(suggested?.suggestions.every((s) => s.name.startsWith("-"))).toBe(true);
  });
});
