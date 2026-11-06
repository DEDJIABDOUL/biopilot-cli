// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import fs from "node:fs";
import path from "node:path";
import { compileCatalog } from "../../../biopilot/knowledge/compile.js";
import { openCatalog } from "../../../biopilot/knowledge/catalog.js";
import { FASTP, MULTIQC, compile, tempDir, writeSources } from "../helpers.js";

describe("Catalog compiler", () => {
  test("compiles valid sources into a Catalog the reader can read", () => {
    const { result, catalogPath } = compile({ "fastp.yml": FASTP, "multiqc.yaml": MULTIQC, "README.md": "not a tool" });
    expect(result).toEqual({ ok: true, toolCount: 2 });

    const opened = openCatalog(catalogPath);
    if (!opened.available) throw new Error(opened.detail);
    expect(opened.catalog.listTools().map((tool) => tool.name)).toEqual(["fastp", "multiqc"]);
    expect(opened.catalog.builtBy).toBe("test");
    opened.catalog.close();
  });

  test("reports a YAML syntax error with its file and line", () => {
    const { result } = compile({ "broken.yml": "name: fastp\noptions: [\n" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ file: "broken.yml", location: expect.stringMatching(/^line \d+$/) });
  });

  test("reports every error of every file in one run, each with file and location", () => {
    const { result } = compile({
      "a.yml": `
name: a
platforms: [pacbio]
options:
  - names: ["in1"]
  - names: ["-x"]
    value: { type: file }
    rank: high
`,
      "b.yml": "description: no name, no version\n",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "a.yml", location: "platforms[0]" }),
        expect.objectContaining({ file: "a.yml", location: "version" }),
        expect.objectContaining({ file: "a.yml", location: "options[0].names[0]" }),
        expect.objectContaining({ file: "a.yml", location: "options[1].value.type" }),
        expect.objectContaining({ file: "a.yml", location: "options[1].rank" }),
        expect.objectContaining({ file: "b.yml", location: "name" }),
        expect.objectContaining({ file: "b.yml", location: "version" }),
      ]),
    );
  });

  test("rejects an alias used twice in the same command", () => {
    const { result } = compile({
      "t.yml": `
name: t
version: { args: ["-v"], regex: '(\\S+)' }
options:
  - names: ["-o", "--out"]
  - names: ["-o"]
`,
    });
    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ file: "t.yml", location: "options[1].names[0]" })] });
  });

  test("rejects two files describing the same tool", () => {
    const { result } = compile({ "fastp.yml": FASTP, "fastp-copy.yml": FASTP });
    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ location: "name", message: expect.stringContaining("already described") })] });
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
});
