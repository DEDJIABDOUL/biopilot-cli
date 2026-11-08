// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import Database from "better-sqlite3";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { RULED, SAMTOOLS, compileValid } from "../helpers.js";

describe("Catalog reader: full-text option search", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "ruled.yml": RULED, "samtools.yml": SAMTOOLS }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  const found = (text: string) =>
    catalog.searchOptions(text).map(({ command, option }) => [...[command.tool, ...command.path], option.canonicalName].join(" "));

  test("finds options by words of their description", () => {
    expect(found("long reads")).toEqual(["ruled --nanopore-mode"]);
  });

  test("every word must match, and the last one may be a prefix", () => {
    expect(found("transcript quant")).toEqual(["ruled --quant"]);
    expect(found("transcript nanopore")).toEqual([]);
  });

  test("finds options by their names, with or without dashes", () => {
    expect(found("--in2")).toEqual(["ruled --in2"]);
    expect(found("in2")).toEqual(["ruled --in2"]);
    expect(found("threads")).toEqual(["samtools sort --threads"]);
  });

  test("results carry the command they belong to, subcommands included", () => {
    expect(found("output file")).toEqual(["samtools sort -o"]);
  });

  test("results are complete options", () => {
    const [result] = catalog.searchOptions("read 2 input");
    expect(result.option).toMatchObject({ canonicalName: "--in2", mate: "--in1", rules: [expect.objectContaining({ boost: 35 })] });
  });

  test("an empty query or one made only of punctuation finds nothing, and never throws", () => {
    expect(found("")).toEqual([]);
    expect(found(`"*() - ^:`)).toEqual([]);
    expect(() => found('read" OR "x')).not.toThrow();
  });

  test("the number of results can be limited", () => {
    expect(catalog.searchOptions("input", 1)).toHaveLength(1);
  });

  test("a search can be kept to one Tool, before the limit applies", () => {
    expect(catalog.searchOptions("threads", 20, "samtools").map(({ command }) => command.tool)).toEqual(["samtools"]);
    expect(catalog.searchOptions("threads", 20, "ruled")).toEqual([]);
    expect(catalog.searchOptions("output", 1, "samtools").map(({ command }) => command.tool)).toEqual(["samtools"]);
  });

  test("a damaged Catalog (index pointing at a missing command or option) never makes search throw", () => {
    const file = compileValid({ "ruled.yml": RULED, "samtools.yml": SAMTOOLS });
    const db = new Database(file);
    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM commands WHERE name = 'sort'").run();
    db.prepare("DELETE FROM options WHERE canonical_name = '--in2'").run();
    db.close();
    const opened = openCatalog(file);
    if (!opened.available) throw new Error(opened.detail);
    expect(() => opened.catalog.searchOptions("output file")).not.toThrow();
    expect(opened.catalog.searchOptions("output file")).toEqual([]);
    expect(opened.catalog.searchOptions("input").map((r) => r.option.canonicalName)).toEqual(["--in1"]);
    opened.catalog.close();
  });
});
