// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import Database from "better-sqlite3";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { MULTIQC, compileValid } from "../helpers.js";

describe("Catalog reader: file formats", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "multiqc.yml": MULTIQC }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  test("lists the declared formats in declaration order, with their kind", () => {
    expect(catalog.listFormats().map((format) => [format.name, format.kind])).toEqual([
      ["fastq", "file"],
      ["fasta", "file"],
      ["bwa-index", "prefix"],
      ["salmon-index", "dir"],
    ]);
  });

  test("matches a file name to its format, compressed variants and any case included", () => {
    expect(catalog.formatOfFile("ctrl_R1.fastq")?.name).toBe("fastq");
    expect(catalog.formatOfFile("ctrl_R1.fq.gz")?.name).toBe("fastq");
    expect(catalog.formatOfFile("data/GENOME.FA")?.name).toBe("fasta");
    expect(catalog.formatOfFile("notes.txt")).toBeUndefined();
  });

  test("recognises files, prefix indexes and folder indexes in a directory listing", () => {
    const listing = [
      "data/ctrl_R1.fastq.gz",
      "ref/genome.fa",
      "ref/genome.fa.amb",
      "ref/genome.fa.ann",
      "ref/genome.fa.bwt",
      "ref/genome.fa.pac",
      "ref/genome.fa.sa",
      "salmon_idx/versionInfo.json",
      "salmon_idx/pos.bin",
      "notes.txt",
    ];
    expect(catalog.matchFiles(listing)).toEqual([
      { path: "data/ctrl_R1.fastq.gz", format: "fastq" },
      { path: "ref/genome.fa", format: "fasta" },
      { path: "ref/genome.fa", format: "bwa-index" },
      { path: "salmon_idx", format: "salmon-index" },
    ]);
  });

  test("an incomplete prefix index is not recognised", () => {
    expect(catalog.matchFiles(["genome.fa.bwt", "genome.fa.sa"])).toEqual([]);
  });

  test("a single file name never reveals a prefix or folder index", () => {
    expect(catalog.formatOfFile("genome.fa.bwt")).toBeUndefined();
    expect(catalog.formatOfFile("salmon_idx/versionInfo.json")).toBeUndefined();
  });

  test("a format whose pattern no longer compiles never throws: it simply matches nothing", () => {
    const file = compileValid({ "multiqc.yml": MULTIQC });
    const db = new Database(file);
    db.prepare("UPDATE formats SET pattern = '([' WHERE name = 'fasta'").run();
    db.close();
    const opened = openCatalog(file);
    if (!opened.available) throw new Error(opened.detail);
    expect(opened.catalog.formatOfFile("genome.fa")).toBeUndefined();
    expect(opened.catalog.formatOfFile("reads.fq")?.name).toBe("fastq");
    expect(opened.catalog.matchFiles(["genome.fa", "reads.fq"])).toEqual([{ path: "reads.fq", format: "fastq" }]);
    opened.catalog.close();
  });
});
