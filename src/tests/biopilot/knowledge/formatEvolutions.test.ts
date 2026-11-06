// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { ALIGNER, ALIGNER_FORMATS, compileValid } from "../helpers.js";

describe("Catalog format evolutions", () => {
  let catalog: Catalog;
  const command = (...path: string[]): Command => catalog.getCommand("aligner", path)!;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "aligner.yml": ALIGNER }, ALIGNER_FORMATS));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  test("a value can accept several formats, in order", () => {
    expect(catalog.findOption(command("sort"), "-o")?.value?.formats).toEqual(["bam", "sam"]);
    expect(catalog.listArguments(command("sort"))[0].value?.formats).toEqual(["bam", "sam"]);
    expect(catalog.listArguments(command("mem"))[0].value?.formats).toEqual(["bwa-index"]);
  });

  test("a folder format is recognised by any one of its marker files", () => {
    expect(catalog.listFormats().find((format) => format.name === "salmon-index")?.markers).toEqual(["versionInfo.json", "refseq.bin"]);
    expect(catalog.matchFiles(["idx1/versionInfo.json", "idx2/refseq.bin", "idx2/info.json", "other/info.json"])).toEqual([
      { path: "idx1", format: "salmon-index" },
      { path: "idx2", format: "salmon-index" },
    ]);
  });

  test("positional arguments can be read-pair mates, known in both directions", () => {
    expect(catalog.listArguments(command("mem")).map((argument) => [argument.name, argument.value?.readRole ?? null, argument.mate])).toEqual([
      ["reference", null, null],
      ["in1", 1, "in2"],
      ["in2", 2, "in1"],
    ]);
  });

  test("help and version may run the tool bare (empty argument lists)", () => {
    expect(catalog.getTool("aligner")?.name).toBe("aligner");
  });
});
