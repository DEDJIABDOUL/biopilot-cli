// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The subcommands a root help lists (ticket #73), on the recorded helps of knowledge/help.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { parseSubcommands } from "../../../biopilot/profile/subcommandParser.js";

const helpDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..", "knowledge", "help");
const root = (tool: string, version: string, file = "root.txt") => parseSubcommands(fs.readFileSync(path.join(helpDir, tool, version, file), "utf-8"));
const names = (tool: string, version: string, file?: string) => root(tool, version, file).map((sub) => sub.name);

describe("subcommands of a root help", () => {
  test("samtools: sections introduced by `-- Indexing`, blank lines between them", () => {
    const subs = names("samtools", "1.25");
    expect(subs).toEqual(expect.arrayContaining(["dict", "faidx", "index", "sort", "view", "markdup", "flagstat"]));
    expect(subs).not.toContain("--");
    expect(root("samtools", "1.25").find((sub) => sub.name === "sort")?.description).toMatch(/sort/i);
  });

  test("bcftools: the same layout, one space less", () => {
    expect(names("bcftools", "1.25")).toEqual(expect.arrayContaining(["index", "annotate", "view", "call", "norm"]));
  });

  test("bwa: `Command: index …` on the header line itself", () => {
    expect(names("bwa", "0.7.19").slice(0, 3)).toEqual(["index", "mem", "fastmap"]);
    expect(names("bwa", "0.7.19")).toContain("bwt2sa");
  });

  test("salmon: clap style; `help` is not a subcommand to learn; options are not subcommands", () => {
    const subs = names("salmon", "2.11.0");
    expect(subs).toEqual(["index", "quant", "quantmerge", "debug-map"]);
  });

  test("a tool without subcommands has none", () => {
    expect(names("fastp", "1.4.0")).toEqual([]);
    expect(names("minimap2", "2.31")).toEqual([]);
  });

  test("at most 50", () => {
    const text = `Commands:\n${Array.from({ length: 80 }, (_, i) => `  cmd${i}   does thing ${i}`).join("\n")}\n`;
    expect(parseSubcommands(text)).toHaveLength(50);
  });
});
