// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The guides say true things (ticket #64): every command they name exists, their rc.toml is accepted by
// the engine, their .biopilot.toml is read in full, and the contributor guide's tool YAML compiles.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { openCatalog } from "../../biopilot/knowledge/catalog.js";
import { detectProject } from "../../biopilot/project/detect.js";
import { compileRepositoryCatalog, compileValid, tempDir } from "./helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..");
const guide = fs.readFileSync(path.join(repoRoot, "docs", "guide.md"), "utf-8");
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
const contributing = fs.readFileSync(path.join(repoRoot, "docs", "contributing-tools.md"), "utf-8");
/** The fenced blocks of a language in a Markdown text. */
const blocks = (text: string, language: string) => [...text.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map((match) => match[1]);

const biopilot = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), ...args], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0", ...env },
    encoding: "utf-8",
  });

jest.setTimeout(60_000);

describe("the user guide", () => {
  test("every `biopilot <command>` it names is a command of the CLI", () => {
    const help = biopilot(["--help"]).stdout;
    const commands = new Set([...help.slice(help.indexOf("Commands:")).matchAll(/^ {2}([a-z-]+)/gm)].map((match) => match[1]));
    const named = new Set([...guide.matchAll(/`biopilot ([a-z][a-z-]*)/g)].map((match) => match[1]));
    expect(named.size).toBeGreaterThanOrEqual(8);
    expect([...named].filter((name) => !commands.has(name))).toEqual([]);
  });

  test("its rc.toml is accepted by the engine", () => {
    const [rc] = blocks(guide, "toml").filter((block) => block.includes("statusLine"));
    const config = tempDir();
    fs.mkdirSync(path.join(config, "biopilot"));
    fs.writeFileSync(path.join(config, "biopilot", "rc.toml"), rc);
    const run = biopilot(["complete", "git ch"], { XDG_CONFIG_HOME: config });
    expect({ code: run.status, stderr: run.stderr }).toEqual({ code: 0, stderr: "" });
  });

  test("its .biopilot.toml is read in full", () => {
    const [project] = blocks(guide, "toml").filter((block) => block.includes("results_dir"));
    const root = tempDir();
    fs.writeFileSync(path.join(root, ".biopilot.toml"), project);
    const opened = openCatalog(compileRepositoryCatalog().catalogPath);
    if (!opened.available) throw new Error(opened.detail);
    expect(detectProject(root, opened.catalog)).toMatchObject({
      assay: "rna-seq",
      platforms: ["illumina"],
      config: { resultsDir: "out", reference: "ref/GRCh38.fa" },
    });
    opened.catalog.close();
  });
});

/** Words after "biopilot" in the messages the README quotes ("biopilot session [live]"…), not commands. */
const MESSAGES = ["session", "resources"];

describe("the README", () => {
  test("every `biopilot <command>` it names is a command of the CLI", () => {
    const help = biopilot(["--help"]).stdout;
    const commands = new Set([...help.slice(help.indexOf("Commands:")).matchAll(/^ {2}([a-z-]+)/gm)].map((match) => match[1]));
    const named = new Set([...readme.matchAll(/biopilot ([a-z][a-z-]*)/g)].map((match) => match[1]).filter((name) => !MESSAGES.includes(name)));
    expect([...named].filter((name) => !commands.has(name))).toEqual([]);
  });

  test("its install step 2 really yields the start line, for bash, zsh and fish", () => {
    for (const shell of ["bash", "zsh", "fish"]) {
      const lines = biopilot(["init", shell]).stdout.trimEnd().split("\n");
      expect(lines.at(-1)).toMatch(new RegExp(`source .*biopilot/init/${shell}/`));
    }
  });

  test("contains no emoji", () => {
    expect([...readme].filter((c) => /\p{Extended_Pictographic}/u.test(c))).toEqual([]);
  });
});

describe("the contributor guide", () => {
  test("its tool YAML compiles with the repository's formats", () => {
    const [tool] = blocks(contributing, "yaml").filter((block) => block.includes("name: bwa"));
    const formats = fs.readFileSync(path.join(repoRoot, "knowledge", "formats.yml"), "utf-8");
    expect(() => compileValid({ "bwa.yml": tool }, formats)).not.toThrow();
  });
});
