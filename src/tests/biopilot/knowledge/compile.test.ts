// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { compileCatalog, TOOL_SCHEMA_PATH, type CompileError } from "../../../biopilot/knowledge/compile.js";
import { openCatalog } from "../../../biopilot/knowledge/catalog.js";
import { PLATFORMS, VALUE_TYPES } from "../../../biopilot/knowledge/schema.js";
import { FASTP, MULTIQC, compile, tempDir, writeSources } from "../helpers.js";

/** A valid tool with `extra` appended to its root mapping (or its options list). */
const tool = (options = "", extra = "", name = "t") => `name: ${name}
version: { args: ["--version"], regex: 'v(\\S+)' }
${extra}
options:
  - names: ["-o", "--out"]
${options}`;

/** Compiles one file and returns its errors (fails the test if it compiled). */
const errorsOf = (content: string): CompileError[] => {
  const { result } = compile({ "t.yml": content });
  if (result.ok) throw new Error("expected the source to be rejected");
  return result.errors;
};

describe("Catalog compiler", () => {
  test("compiles valid sources into a Catalog the reader can read", () => {
    const { result, catalogPath } = compile({ "fastp.yml": FASTP, "multiqc.yaml": MULTIQC, "README.md": "not a tool" });
    expect(result).toEqual({ ok: true, toolCount: 2 });

    const opened = openCatalog(catalogPath);
    if (!opened.available) throw new Error(opened.detail);
    expect(opened.catalog.listTools().map((t) => t.name)).toEqual(["fastp", "multiqc"]);
    expect(opened.catalog.builtBy).toBe("test");
    opened.catalog.close();
  });

  test("the repository's own tool sources compile", () => {
    const sourcesDir = path.resolve(path.dirname(TOOL_SCHEMA_PATH), "..", "knowledge", "tools");
    const result = compileCatalog({ sourcesDir, outputPath: path.join(tempDir(), "k.db"), biopilotVersion: "test" });
    expect(result.ok).toBe(true);
  });

  describe("reports each rule violation with file, location and line", () => {
    test("YAML syntax error", () => {
      expect(errorsOf("name: t\noptions: [\n")[0]).toMatchObject({ file: "t.yml", location: "document", line: expect.any(Number) });
    });

    test("missing required field", () => {
      const errors = errorsOf("description: no name, no version\n");
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ location: "name", message: "required field is missing", line: 1 }),
          expect.objectContaining({ location: "version", message: "required field is missing" }),
        ]),
      );
    });

    test("unknown field (typo)", () => {
      expect(errorsOf(tool("    descripton: oops"))).toEqual([
        expect.objectContaining({ location: "options[0].descripton", message: "unknown field", line: 6 }),
      ]);
    });

    test("unknown platform", () => {
      expect(errorsOf(tool("", "platforms: [pacbio]"))).toEqual([
        expect.objectContaining({ location: "platforms[0]", message: expect.stringContaining("illumina") }),
      ]);
    });

    test.each([
      ["above 100", "101"],
      ["below 0", "-1"],
      ["not an integer", "high"],
    ])("rank %s", (_, rank) => {
      expect(errorsOf(tool(`    rank: ${rank}`))).toEqual([expect.objectContaining({ location: "options[0].rank", line: 6 })]);
    });

    test.each([["101"], ["-101"], ["1.5"]])("boost %s is outside -100..+100 or not an integer", (boost) => {
      const errors = errorsOf(tool(`    rules:\n      - when: { used: ["-o"] }\n        boost: ${boost}`));
      expect(errors).toEqual([expect.objectContaining({ location: "options[0].rules[0].boost" })]);
    });

    test("boosts of -100 and +100 are accepted", () => {
      const { result } = compile({ "t.yml": tool(`    rules:\n      - when: {}\n        boost: -100\n      - when: {}\n        boost: 100`) });
      expect(result.ok).toBe(true);
    });

    test("option name that is not -x or --long", () => {
      expect(errorsOf(tool(`  - names: ["in1"]`))).toEqual([
        expect.objectContaining({ location: "options[1].names[0]", message: expect.stringContaining("not an option name") }),
      ]);
    });

    test("unknown value type", () => {
      expect(errorsOf(tool(`    value: { type: file }`))).toEqual([expect.objectContaining({ location: "options[0].value.type" })]);
    });

    test("version regex that doesn't compile", () => {
      const source = tool().replace("'v(\\S+)'", "'v(['");
      expect(errorsOf(source)).toEqual([
        expect.objectContaining({ location: "version.regex", message: expect.stringContaining("not a valid regular expression") }),
      ]);
    });

    test.each([
      ["no", "'v\\S+'", "found 0"],
      ["two", "'(v)(\\S+)'", "found 2"],
    ])("version regex with %s capture group", (_, regex, found) => {
      const source = tool().replace("'v(\\S+)'", regex);
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "version.regex", line: 2, message: expect.stringContaining(found) })]);
    });

    test("alias used twice in the same command", () => {
      expect(errorsOf(tool(`  - names: ["-o"]`))).toEqual([
        expect.objectContaining({ location: "options[1].names[0]", line: 6, message: expect.stringContaining("options[0]") }),
      ]);
    });

    test("two files describing the same tool", () => {
      const { result } = compile({ "fastp.yml": FASTP, "fastp-copy.yml": FASTP });
      expect(result).toEqual({
        ok: false,
        errors: [expect.objectContaining({ file: "fastp.yml", location: "name", message: expect.stringContaining("already described") })],
      });
    });
  });

  test("reports every error of every file in one run", () => {
    const { result } = compile({
      "a.yml": tool(`    rank: 200\n  - names: ["-o"]`, "platforms: [pacbio]", "a"),
      "b.yml": "description: no name, no version\n",
      "c.yml": "name: c\noptions: [\n",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => `${e.file} ${e.location}`).sort()).toEqual(
      ["a.yml options[0].rank", "a.yml options[1].names[0]", "a.yml platforms[0]", "b.yml name", "b.yml version", "c.yml document"].sort(),
    );
  });

  test("leaves an existing Catalog untouched when the sources are invalid", () => {
    const outputPath = path.join(tempDir(), "knowledge.db");
    fs.writeFileSync(outputPath, "previous catalog");
    const result = compileCatalog({ sourcesDir: writeSources({ "bad.yml": "name: bad\n" }), outputPath, biopilotVersion: "test" });
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(outputPath, "utf-8")).toBe("previous catalog");
  });

  test("reports a missing sources folder", () => {
    const result = compileCatalog({ sourcesDir: path.join(tempDir(), "missing"), outputPath: path.join(tempDir(), "k.db"), biopilotVersion: "test" });
    expect(result.ok).toBe(false);
  });

  test("`npm run build:db` exits non-zero and prints file:line for invalid sources (what CI relies on)", () => {
    const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
    const sourcesDir = writeSources({ "t.yml": tool("    rank: 101") });
    const run = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "scripts", "build-db.ts"), sourcesDir, path.join(tempDir(), "k.db")], {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/t\.yml:6 › options\[0\]\.rank: /);
  });

  test("the published schema and the code agree on platforms and value types", () => {
    const schema = JSON.parse(fs.readFileSync(TOOL_SCHEMA_PATH, "utf-8"));
    expect(schema.properties.platforms.items.enum).toEqual([...PLATFORMS]);
    expect(schema.definitions.option.properties.value.properties.type.enum).toEqual([...VALUE_TYPES]);
  });
});
