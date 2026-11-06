// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { catalogCandidates } from "../../../biopilot/knowledge/location.js";
import { CATALOG_SCHEMA_VERSION } from "../../../biopilot/knowledge/schema.js";
import { FASTP, MULTIQC, compileValid, tempDir } from "../helpers.js";

describe("Catalog reader", () => {
  let catalog: Catalog;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "fastp.yml": FASTP, "multiqc.yml": MULTIQC }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
  });
  afterAll(() => catalog.close());

  test("lists tools by name with their platforms; no platform means generic (empty set)", () => {
    expect(catalog.listTools()).toEqual([
      { name: "fastp", package: "fastp", description: "FASTQ preprocessing", platforms: ["illumina"] },
      { name: "multiqc", package: null, description: "aggregates reports", platforms: [] },
    ]);
  });

  test("gets a tool by name, and nothing for an unknown tool", () => {
    expect(catalog.getTool("fastp")?.name).toBe("fastp");
    expect(catalog.getTool("samtools")).toBeUndefined();
  });

  test("resolves the root command; unknown tools and (for now) subcommands resolve to nothing", () => {
    expect(catalog.getCommand("fastp")).toEqual({ tool: "fastp", path: [], description: null });
    expect(catalog.getCommand("nope")).toBeUndefined();
    expect(catalog.getCommand("fastp", ["sort"])).toBeUndefined();
  });

  test("lists options by rank, highest first, ties in Catalog order; unset rank defaults to 50", () => {
    const options = catalog.listOptions(catalog.getCommand("fastp")!);
    expect(options.map((option) => [option.canonicalName, option.rank])).toEqual([
      ["--in1", 95],
      ["--thread", 75],
      ["--in2", 60],
      ["--dedup", 60],
      ["-z", 50],
    ]);
  });

  test("exposes canonical name, aliases, value type and default", () => {
    const thread = catalog.findOption(catalog.getCommand("fastp")!, "--thread");
    expect(thread).toEqual({ canonicalName: "--thread", aliases: ["-w", "--thread"], description: null, valueType: "int", defaultValue: "3", rank: 75 });
    const dedup = catalog.findOption(catalog.getCommand("fastp")!, "-D");
    expect(dedup?.valueType).toBeNull();
  });

  test("finds an option by any alias; the canonical name is the first long name, else the first name", () => {
    const fastp = catalog.getCommand("fastp")!;
    expect(catalog.findOption(fastp, "-i")?.canonicalName).toBe("--in1");
    expect(catalog.findOption(fastp, "--in1")?.canonicalName).toBe("--in1");
    expect(catalog.findOption(fastp, "-z")?.canonicalName).toBe("-z");
  });

  test("alias lookup is case-sensitive and scoped to the command", () => {
    const fastp = catalog.getCommand("fastp")!;
    expect(catalog.findOption(fastp, "-I")?.canonicalName).toBe("--in2");
    expect(catalog.findOption(fastp, "-i")?.canonicalName).toBe("--in1");
    expect(catalog.findOption(fastp, "--IN1")).toBeUndefined();
    expect(catalog.findOption(catalog.getCommand("multiqc")!, "-i")).toBeUndefined();
  });

  test("answers lookups well under 2 ms", () => {
    const fastp = catalog.getCommand("fastp")!;
    const start = performance.now();
    for (let i = 0; i < 200; i++) catalog.findOption(fastp, "-i");
    expect((performance.now() - start) / 200).toBeLessThan(2);
  });
});

describe("Catalog availability", () => {
  test("a missing file is unavailable, not an exception", () => {
    expect(openCatalog(path.join(tempDir(), "missing.db"))).toMatchObject({ available: false, reason: "not-found" });
  });

  test("a corrupt file is unavailable, not an exception", () => {
    const file = path.join(tempDir(), "knowledge.db");
    fs.writeFileSync(file, "this is not a database");
    expect(openCatalog(file)).toMatchObject({ available: false, reason: "unreadable" });
  });

  test("a Catalog with another schema version is unavailable", () => {
    const file = compileValid({ "fastp.yml": FASTP });
    const db = new Database(file);
    db.prepare("UPDATE metadata SET value = ? WHERE key = 'schema_version'").run(String(CATALOG_SCHEMA_VERSION + 1));
    db.close();
    expect(openCatalog(file)).toMatchObject({ available: false, reason: "incompatible-schema" });
  });

  test("BIOPILOT_CATALOG, when set, is the only place searched", () => {
    expect(catalogCandidates({ BIOPILOT_CATALOG: "/tmp/some.db" })).toEqual(["/tmp/some.db"]);
  });

  test("otherwise the data directory comes first", () => {
    const [first] = catalogCandidates({});
    expect(path.basename(first)).toBe("knowledge.db");
    expect(first).not.toContain(`${path.sep}build${path.sep}`);
  });
});
