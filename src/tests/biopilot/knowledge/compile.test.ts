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

  test("a Catalog that cannot be written is reported as an error, and leaves no temporary file", () => {
    const outputDir = tempDir();
    const outputPath = path.join(outputDir, "knowledge.db");
    fs.mkdirSync(outputPath); // a folder where the Catalog file should go
    const result = compileCatalog({ sourcesDir: writeSources({ "fastp.yml": FASTP }), outputPath, biopilotVersion: "test" });
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ file: outputPath, message: expect.stringContaining("cannot write the Catalog") })],
    });
    expect(fs.readdirSync(outputDir)).toEqual(["knowledge.db"]);
  });

  test("the repository's own tool sources compile", () => {
    const knowledge = path.resolve(path.dirname(TOOL_SCHEMA_PATH), "..", "knowledge");
    const result = compileCatalog({
      sourcesDir: path.join(knowledge, "tools"),
      formatsPath: path.join(knowledge, "formats.yml"),
      outputPath: path.join(tempDir(), "k.db"),
      biopilotVersion: "test",
    });
    expect(result).toMatchObject({ ok: true });
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
      expect(errorsOf(tool(`    value: { type: path }`))).toEqual([expect.objectContaining({ location: "options[0].value.type" })]);
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

    test("alias used twice in a subcommand (aliases are unique per command, at any depth)", () => {
      const source = tool("", 'commands:\n  - name: sort\n    options:\n      - names: ["-o"]\n      - names: ["-o", "--out"]');
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "commands[0].options[1].names[0]", line: 7 })]);
    });

    test("the same alias in a parent and a subcommand is fine", () => {
      const { result } = compile({ "t.yml": tool("", 'commands:\n  - name: sort\n    options:\n      - names: ["-o"]') });
      expect(result.ok).toBe(true);
    });

    test("two subcommands with the same name under one parent", () => {
      const source = tool("", "commands:\n  - name: sort\n  - name: view\n    commands:\n      - name: x\n      - name: x\n  - name: sort");
      expect(
        errorsOf(source)
          .map((e) => e.location)
          .sort(),
      ).toEqual(["commands[1].commands[1].name", "commands[2].name"]);
    });

    test("a variadic positional argument that is not the last one", () => {
      const source = tool("", "arguments:\n  - name: files\n    variadic: true\n  - name: out");
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "arguments[0].variadic", message: expect.stringContaining("last") })]);
    });

    test.each([
      ["an undeclared format", "    value: { type: file, format: bam }", "options[0].value.format", "not declared"],
      ["a format on a non-file type", "    value: { type: string, format: fastq }", "options[0].value.format", "only applies to type file or dir"],
      ["a folder format on type file", "    value: { type: file, format: salmon-index }", "options[0].value.format", "use type dir"],
      ["a file format on type dir", "    value: { type: dir, format: fastq }", "options[0].value.format", "use type file"],
      ["an enum without values", "    value: { type: enum }", "options[0].value.values", "at least one value"],
      ["a read role on a non-file type", "    value: { type: string, read_role: 1 }", "options[0].value.read_role", "only applies to type file"],
      [
        "a mate that is not an option of the command",
        "    value: { type: file, read_role: 2, mate_of: --nope }",
        "options[0].value.mate_of",
        "not an option of this command",
      ],
      ["an option that is its own mate", "    value: { type: file, read_role: 2, mate_of: --out }", "options[0].value.mate_of", "its own mate"],
      [
        "a derived output from an unknown option",
        "    value: { type: file, derive: { from: --nope, suffix: .x } }",
        "options[0].value.derive.from",
        "not an option",
      ],
      [
        "a derived output on a non-file type",
        "    value: { type: string, derive: { from: --out, suffix: .x } }",
        "options[0].value.derive",
        "only applies to type file",
      ],
    ])("rejects %s", (_, option, location, message) => {
      expect(errorsOf(tool(option))).toEqual(expect.arrayContaining([expect.objectContaining({ location, message: expect.stringContaining(message) })]));
    });

    test("rejects mates whose read roles are not 1 and 2", () => {
      const source = tool(`    value: { type: file, read_role: 1 }\n  - names: ["-I"]\n    value: { type: file, read_role: 1, mate_of: "-o" }`);
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "options[1].value.mate_of", message: expect.stringContaining("1 and 2") })]);
    });

    test.each([
      ["an option used that is not in the command", `when: { used: ["--nope"] }`, "options[0].rules[0].when.used[0]", "not an option of this command"],
      ["an unknown condition", `when: { tool: fastp }`, "options[0].rules[0].when.tool", "unknown field"],
      ["an unknown assay", `when: { assay: chip-seq }`, "options[0].rules[0].when.assay", "rna-seq"],
      ["an unknown platform", `when: { platform: pacbio }`, "options[0].rules[0].when.platform", "nanopore"],
    ])("rejects a rule with %s", (_, when, location, message) => {
      const source = tool(`    rules:\n      - ${when}\n        boost: 10`);
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location, message: expect.stringContaining(message) })]);
    });

    test("accepts a rule using an option of the same command by any alias", () => {
      const { result } = compile({
        "t.yml": tool(`    rules:\n      - when: { used: ["--out"], paired: false, platform: illumina, assay: rna-seq }\n        boost: -20`),
      });
      expect(result.ok).toBe(true);
    });

    test("checks every format of a list, at its own index", () => {
      expect(errorsOf(tool("    value: { type: file, format: [fastq, bam] }"))).toEqual([
        expect.objectContaining({ location: "options[0].value.format[1]", message: expect.stringContaining("not declared") }),
      ]);
    });

    test.each([
      [
        "a mate that is not an argument",
        "  - name: a\n    value: { type: file, read_role: 2, mate_of: nope }",
        "arguments[0].value.mate_of",
        "not an argument",
      ],
      [
        "mates with the same read role",
        "  - name: a\n    value: { type: file, read_role: 1 }\n  - name: b\n    value: { type: file, read_role: 1, mate_of: a }",
        "arguments[1].value.mate_of",
        "1 and 2",
      ],
      [
        "two arguments claiming the same mate",
        "  - name: a\n    value: { type: file, read_role: 1 }\n  - name: b\n    value: { type: file, read_role: 2, mate_of: a }\n  - name: c\n    value: { type: file, read_role: 2, mate_of: a }",
        "arguments[2].value.mate_of",
        "already the mate",
      ],
      [
        "two arguments with the same name",
        "  - name: in.fq\n    value: { type: file }\n  - name: in.fq\n    value: { type: file }",
        "arguments[1].name",
        "already described at arguments[0]",
      ],
      [
        "a derived output on an argument",
        "  - name: a\n    value: { type: file, derive: { from: a, suffix: .x } }",
        "arguments[0].value.derive",
        "only applies to options",
      ],
    ])("rejects %s", (_, args, location, message) => {
      expect(errorsOf(tool("", `arguments:\n${args}`))).toEqual(
        expect.arrayContaining([expect.objectContaining({ location, message: expect.stringContaining(message) })]),
      );
    });

    test("rejects two options claiming the same mate", () => {
      const source = tool(
        `    value: { type: file, read_role: 1 }\n  - names: ["-I"]\n    value: { type: file, read_role: 2, mate_of: "-o" }\n  - names: ["-J"]\n    value: { type: file, read_role: 2, mate_of: "--out" }`,
      );
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "options[2].value.mate_of", message: expect.stringContaining("options[1]") })]);
    });

    test("rejects an undeclared format on a positional argument", () => {
      const source = tool("", "arguments:\n  - name: in\n    value: { type: file, format: bam }");
      expect(errorsOf(source)).toEqual([expect.objectContaining({ location: "arguments[0].value.format" })]);
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
    expect(schema.definitions.optionValue.properties.type.enum).toEqual([...VALUE_TYPES]);
    expect(schema.definitions.argumentValue.properties.type.enum).toEqual([...VALUE_TYPES]);
  });

  describe("the formats file", () => {
    const formatErrors = (formats: string) => {
      const { result } = compile({ "fastp.yml": FASTP }, formats);
      if (result.ok) throw new Error("expected the formats file to be rejected");
      return result.errors;
    };

    test("is validated: a prefix index needs suffixes, fields must fit the kind", () => {
      const errors = formatErrors("formats:\n  - name: idx\n    kind: prefix\n  - name: odd\n    pattern: 'x'\n    marker: m\n");
      expect(errors.map((e) => e.location)).toEqual(expect.arrayContaining(["formats[0].suffixes", "formats[1]"]));
      expect(errors.every((e) => e.file.endsWith("formats.yml"))).toBe(true);
    });

    test("rejects a format declared twice and a pattern that does not compile", () => {
      const errors = formatErrors("formats:\n  - name: fq\n    pattern: 'fq$'\n  - name: fq\n    pattern: '(['\n");
      expect(errors.map((e) => e.location).sort()).toEqual(["formats[1].name", "formats[1].pattern"]);
    });

    test("a missing formats file is an error", () => {
      const result = compileCatalog({
        sourcesDir: writeSources({}),
        formatsPath: path.join(tempDir(), "nope.yml"),
        outputPath: path.join(tempDir(), "k.db"),
        biopilotVersion: "test",
      });
      expect(result.ok).toBe(false);
    });

    test("the repository's formats file and tool sources compile together", () => {
      const result = compileCatalog({
        sourcesDir: path.resolve(path.dirname(TOOL_SCHEMA_PATH), "..", "knowledge", "tools"),
        formatsPath: path.resolve(path.dirname(TOOL_SCHEMA_PATH), "..", "knowledge", "formats.yml"),
        outputPath: path.join(tempDir(), "k.db"),
        biopilotVersion: "test",
      });
      expect(result).toEqual({ ok: true, toolCount: expect.any(Number) });
    });
  });
});
