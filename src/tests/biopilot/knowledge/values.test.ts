// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { TRIMMER, compileValid } from "../helpers.js";

describe("Catalog reader: values, formats and mates", () => {
  let catalog: Catalog;
  let root: Command;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "trimmer.yml": TRIMMER }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
    root = catalog.getCommand("trimmer")!;
  });
  afterAll(() => catalog.close());
  const option = (alias: string) => catalog.findOption(root, alias)!;

  test("a file option carries its format and read role", () => {
    expect(option("--in1").value).toEqual({ type: "file", formats: ["fastq"], optional: false, multiple: false, values: [], readRole: 1 });
  });

  test("a folder option carries its folder format", () => {
    expect(option("--index").value).toMatchObject({ type: "dir", formats: ["salmon-index"] });
  });

  test("enum values come in order, with descriptions", () => {
    expect(option("--mode").value).toMatchObject({
      type: "enum",
      values: [
        { value: "fast", description: "quick and rough" },
        { value: "slow", description: null },
      ],
    });
  });

  test("a non-enum option can carry suggested values", () => {
    expect(option("--adapter").value).toMatchObject({ type: "string", values: [{ value: "AGATCGGAAGAGC", description: null }] });
  });

  test("option forms: optional value, several values, repeatable, hidden, deprecated", () => {
    expect(option("--color").value?.optional).toBe(true);
    expect(option("--region").value?.multiple).toBe(true);
    expect(option("--region").repeatable).toBe(true);
    expect(option("--debug-dump").hidden).toBe(true);
    expect(option("--old").deprecated).toBe(true);
    expect(option("--in1")).toMatchObject({ repeatable: false, hidden: false, deprecated: false });
  });

  test("version range, when known", () => {
    expect(option("--dedup")).toMatchObject({ since: "0.22.0", until: null });
    expect(option("--old")).toMatchObject({ since: null, until: "0.20.1" });
  });

  test("read-pair mates are known in both directions, by canonical name", () => {
    expect(option("-I").mate).toBe("--in1");
    expect(option("-i").mate).toBe("--in2");
    expect(option("--out1").mate).toBeNull();
  });

  test("a derived output names its source option canonically, with the suffix", () => {
    expect(option("-o").derive).toEqual({ from: "--in1", suffix: ".trimmed" });
    expect(option("--in1").derive).toBeNull();
  });

  test("positional arguments carry values, defaults and version ranges too", () => {
    expect(catalog.listArguments(root)).toEqual([
      {
        name: "reference",
        description: null,
        variadic: false,
        value: { type: "file", formats: ["fasta"], optional: false, multiple: false, values: [], readRole: null },
        defaultValue: null,
        since: null,
        until: null,
        mate: null,
      },
      {
        name: "reads",
        description: null,
        variadic: true,
        value: { type: "file", formats: ["fastq"], optional: false, multiple: false, values: [], readRole: 1 },
        defaultValue: "reads.fq",
        since: "1.0",
        until: null,
        mate: null,
      },
    ]);
  });
});
