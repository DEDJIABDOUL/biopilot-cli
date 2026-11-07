// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// What the engine suggests for a typed line when the first word is a Catalog tool (phase 2).
// Seam: the engine's getSuggestions, with BIOPILOT_CATALOG pointing to the Catalog compiled from knowledge/.

import os from "node:os";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog } from "../helpers.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  runtime = await import("../../../runtime/runtime.js");
});

const suggest = async (line: string) => (await runtime.getSuggestions(line, os.tmpdir(), Shell.Bash))?.suggestions ?? [];
const names = async (line: string) => (await suggest(line)).map((s) => s.name);

describe("Catalog tools in the engine", () => {
  test("`fastp ` suggests --in1 first (annex C, scenario 1)", async () => {
    expect((await names("fastp "))[0]).toBe("--in1");
  });

  test("`fastp --` lists fastp's options in Catalog priority", async () => {
    expect((await names("fastp --")).slice(0, 5)).toEqual(["--in1", "--thread", "--json", "--html", "--out1"]);
  });

  test("typing narrows the list as usual", async () => {
    expect(await names("fastp --dedup")).toEqual(expect.arrayContaining(["--dedup"]));
    expect((await names("fastp --dedup")).every((name) => name.startsWith("--dedup"))).toBe(true);
  });

  test("an option already on the line is not suggested again (annex C, scenario 4, first half)", async () => {
    const after = await names("fastp -i reads_R1.fq --");
    expect(after).not.toContain("--in1");
    expect(after.length).toBeGreaterThan(10);
  });

  test("descriptions come from the Catalog", async () => {
    const [in1] = await suggest("fastp --in1");
    expect(in1.description).toBe("FASTQ file of read 1 (or of single-end reads) to clean");
  });

  test("`samtools ` suggests its subcommands; `samtools sort -` its own options", async () => {
    expect(await names("samtools ")).toEqual(expect.arrayContaining(["sort", "view", "index", "faidx"]));
    expect(await names("samtools sort -")).toEqual(expect.arrayContaining(["-o", "-n", "--threads"]));
  });

  test("`minimap2 -x ` suggests the presets", async () => {
    expect(await names("minimap2 -x ")).toEqual(expect.arrayContaining(["map-ont", "sr", "asm5"]));
  });
});
