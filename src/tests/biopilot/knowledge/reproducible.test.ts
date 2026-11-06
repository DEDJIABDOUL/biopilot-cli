// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Reproducible builds (spec §11, ticket #9): the same YAML always compiles to the same bytes,
// so a release Catalog can be verified by rebuilding it.

import fs from "node:fs";
import path from "node:path";
import { jest } from "@jest/globals";
import Database from "better-sqlite3";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { FASTP, FORMATS, MULTIQC, RULED, SAMTOOLS, TRIMMER, compileRepositoryCatalog, tempDir, writeSources } from "../helpers.js";

const FIXTURES = { "fastp.yml": FASTP, "multiqc.yml": MULTIQC, "samtools.yml": SAMTOOLS, "trimmer.yml": TRIMMER, "ruled.yml": RULED };

/** Compiles `sourcesDir` (with the shared fixture formats) into a new temporary file and returns its bytes. */
const compileBytes = (sourcesDir: string): Buffer => {
  const formatsPath = path.join(tempDir(), "formats.yml");
  fs.writeFileSync(formatsPath, FORMATS);
  const outputPath = path.join(tempDir(), "knowledge.db");
  const result = compileCatalog({ sourcesDir, formatsPath, outputPath, biopilotVersion: "test" });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return fs.readFileSync(outputPath);
};

const reversed = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).reverse());

describe("reproducible Catalog build", () => {
  afterEach(() => jest.useRealTimers());

  test("the same sources compile to byte-identical Catalogs, whatever the output path or the time", () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
    const first = compileBytes(writeSources(FIXTURES));
    jest.setSystemTime(new Date("2031-06-15T12:34:56Z"));
    // Other folders, files created in the opposite order.
    const second = compileBytes(writeSources(reversed(FIXTURES)));
    expect(second.equals(first)).toBe(true);
  });

  test("the repository's own Catalog (knowledge/) compiles to the same bytes twice", () => {
    const first = fs.readFileSync(compileRepositoryCatalog().catalogPath);
    const second = fs.readFileSync(compileRepositoryCatalog().catalogPath);
    expect(second.equals(first)).toBe(true);
  });

  describe("what makes it reproducible", () => {
    let db: Database.Database;
    beforeAll(() => {
      const outputPath = path.join(tempDir(), "knowledge.db");
      fs.writeFileSync(outputPath, compileBytes(writeSources(reversed(FIXTURES))));
      db = new Database(outputPath, { readonly: true });
    });
    afterAll(() => db.close());

    test("tools are inserted by name, not in file or directory order", () => {
      const names = db
        .prepare<[], { name: string }>("SELECT name FROM tools ORDER BY id")
        .all()
        .map((row) => row.name);
      expect(names).toEqual([...names].sort());
      expect(names).toHaveLength(Object.keys(FIXTURES).length);
    });

    test("options are inserted in YAML order", () => {
      const options = db
        .prepare<[], { canonical_name: string }>(
          "SELECT o.canonical_name FROM options o JOIN commands c ON c.id = o.command_id JOIN tools t ON t.id = c.tool_id WHERE t.name = 'fastp' AND c.parent_id IS NULL ORDER BY o.id",
        )
        .all()
        .map((row) => row.canonical_name);
      expect(options).toEqual(["--in1", "--in2", "--thread", "--dedup", "-z"]);
    });

    test("no timestamp is recorded: the metadata holds only the schema and BioPilot versions", () => {
      const keys = db
        .prepare<[], { key: string }>("SELECT key FROM metadata ORDER BY key")
        .all()
        .map((row) => row.key);
      expect(keys).toEqual(["biopilot_version", "schema_version"]);
    });

    test("the file is compacted: no free page is left", () => {
      expect(db.pragma("freelist_count", { simple: true })).toBe(0);
    });
  });
});
