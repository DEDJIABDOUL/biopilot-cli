// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { SAMTOOLS, compileValid } from "../helpers.js";

describe("Catalog reader: subcommands and positional arguments", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "samtools.yml": SAMTOOLS }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  test("resolves a subcommand from its path", () => {
    expect(catalog.getCommand("samtools", ["sort"])).toEqual({ tool: "samtools", path: ["sort"], description: "sort alignments" });
  });

  test("resolves nested subcommands at any depth", () => {
    expect(catalog.getCommand("samtools", ["deep", "deeper"])).toEqual({ tool: "samtools", path: ["deep", "deeper"], description: "two levels down" });
  });

  test("an unknown subcommand at any level resolves to nothing", () => {
    expect(catalog.getCommand("samtools", ["nope"])).toBeUndefined();
    expect(catalog.getCommand("samtools", ["deep", "nope"])).toBeUndefined();
    expect(catalog.getCommand("samtools", ["sort", "deeper"])).toBeUndefined();
  });

  test("a subcommand has its own options, ordered by rank", () => {
    const sort = catalog.getCommand("samtools", ["sort"])!;
    expect(catalog.listOptions(sort).map((option) => option.canonicalName)).toEqual(["-o", "--threads"]);
  });

  test("alias lookup is scoped to the command: the same alias means different options", () => {
    const root = catalog.getCommand("samtools")!;
    const sort = catalog.getCommand("samtools", ["sort"])!;
    expect(catalog.findOption(root, "-o")?.description).toBe("root-level option, unrelated to sort's -o");
    expect(catalog.findOption(sort, "-o")?.description).toBe("output file");
    expect(catalog.findOption(sort, "-@")?.canonicalName).toBe("--threads");
    expect(catalog.findOption(root, "-@")).toBeUndefined();
  });

  test("lists a command's subcommands in Catalog order", () => {
    expect(catalog.listSubcommands(catalog.getCommand("samtools")!)).toEqual([
      { tool: "samtools", path: ["sort"], description: "sort alignments" },
      { tool: "samtools", path: ["view"], description: "view and convert" },
      { tool: "samtools", path: ["deep"], description: null },
    ]);
    expect(catalog.listSubcommands(catalog.getCommand("samtools", ["deep"])!).map((c) => c.path)).toEqual([["deep", "deeper"]]);
    expect(catalog.listSubcommands(catalog.getCommand("samtools", ["sort"])!)).toEqual([]);
  });

  test("lists a command's positional arguments in order; variadic defaults to false", () => {
    expect(catalog.listArguments(catalog.getCommand("samtools", ["view"])!)).toEqual([
      expect.objectContaining({ name: "in.bam", description: null, variadic: false }),
      expect.objectContaining({ name: "region", description: null, variadic: true }),
    ]);
    expect(catalog.listArguments(catalog.getCommand("samtools", ["sort"])!)).toEqual([
      expect.objectContaining({ name: "in.bam", description: "alignments to sort", variadic: false }),
    ]);
    expect(catalog.listArguments(catalog.getCommand("samtools")!)).toEqual([]);
  });

  test("a command two levels down has its own options", () => {
    const deeper = catalog.getCommand("samtools", ["deep", "deeper"])!;
    expect(catalog.listOptions(deeper).map((option) => option.canonicalName)).toEqual(["--flag"]);
    expect(catalog.findOption(deeper, "-o")).toBeUndefined();
  });
});
