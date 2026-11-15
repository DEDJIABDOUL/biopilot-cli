// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create <project>` creates the folders of a standard project, recognised at once by its layout;
// `--print` prints the `mkdir -p … && cd …` line instead and creates nothing.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { createLine, runCreate } from "../../../biopilot/cli/createRunner.js";
import { LAYOUT_MARKER, PROJECT_FOLDERS } from "../../../biopilot/project/layout.js";
import { detectProject } from "../../../biopilot/project/detect.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const run = (args: string[], options: { print?: boolean } = {}, cwd = tempDir()) => {
  let stdout = "";
  let stderr = "";
  const code = runCreate(args, options, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), cwd });
  return { code, stdout, stderr, cwd };
};

const layoutOf = (root: string) => PROJECT_FOLDERS.filter((folder) => fs.statSync(path.join(root, folder), { throwIfNoEntry: false })?.isDirectory());

test("biopilot create makes every folder of the layout, and says how to enter it", () => {
  const { code, stdout, stderr, cwd } = run(["magic"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(layoutOf(path.join(cwd, "magic"))).toEqual(PROJECT_FOLDERS);
  expect(stdout).toBe(
    "created magic/ with data/raw/ data/processed/ metadata/ reference/ results/ scripts/ logs/ envs/ notebooks/ docs/\nto enter it: cd magic\n",
  );
});

test("folders already there are kept, with their files; only the missing ones are made", () => {
  const cwd = tempDir();
  fs.mkdirSync(path.join(cwd, "p", "data", "raw"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "p", "data", "raw", "s1_R1.fastq.gz"), "reads");
  const { code, stdout } = run(["p"], {}, cwd);
  expect(code).toBe(0);
  expect(stdout).toContain("created p/ with data/processed/ metadata/");
  expect(stdout).not.toContain("data/raw/");
  expect(fs.readFileSync(path.join(cwd, "p", "data", "raw", "s1_R1.fastq.gz"), "utf-8")).toBe("reads");
  const again = run(["p"], {}, cwd);
  expect(again.code).toBe(0);
  expect(again.stdout).toBe("p/ already has the project layout; nothing created\nto enter it: cd p\n");
});

test("a file in the way stops it with exit code 1 and a message", () => {
  const cwd = tempDir();
  fs.mkdirSync(path.join(cwd, "p"));
  fs.writeFileSync(path.join(cwd, "p", "metadata"), "");
  const { code, stderr } = run(["p"], {}, cwd);
  expect(code).toBe(1);
  expect(stderr).toBe("biopilot: p/metadata: a file is in the way\n");
});

test("a path is created where it points, ~/ being the home folder", () => {
  const cwd = tempDir();
  expect(run(["../sibling/"], {}, path.join(cwd, "here")).code).toBe(0);
  expect(layoutOf(path.join(cwd, "sibling"))).toEqual(PROJECT_FOLDERS);
  const home = tempDir();
  const spy = jest.spyOn(os, "homedir").mockReturnValue(home);
  try {
    expect(run(["~/projects/wgs"]).code).toBe(0);
    expect(layoutOf(path.join(home, "projects", "wgs"))).toEqual(PROJECT_FOLDERS);
  } finally {
    spy.mockRestore();
  }
});

test("--print writes the line and creates nothing", () => {
  const { code, stdout, stderr, cwd } = run(["rnaseq-2026"], { print: true });
  expect(fs.readdirSync(cwd)).toEqual([]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe(
    "mkdir -p rnaseq-2026/data/raw rnaseq-2026/data/processed rnaseq-2026/metadata rnaseq-2026/reference rnaseq-2026/results " +
      "rnaseq-2026/scripts rnaseq-2026/logs rnaseq-2026/envs rnaseq-2026/notebooks rnaseq-2026/docs && cd rnaseq-2026\n",
  );
});

test("read files in data/raw stay within the project scan (depth 3)", () => {
  for (const folder of PROJECT_FOLDERS) expect(folder.split("/").length).toBeLessThanOrEqual(2);
});

test.each([["~/projects/wgs_trio"], ["/scratch/me/wgs"], ["../wgs"], ["wgs/"]])("a path is accepted: %s", (name) => {
  const result = createLine(name);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.line).toContain(`${name.replace(/\/$/, "")}/data/raw `);
});

test.each([[""], ["-rf"], [".hidden"], ["my project"], ["a;rm -rf ~"], ["$(id)"], ["a\\b"], ["x/.."], ["p\x1b[2J"]])(
  "a name that would need quoting, or read as an option, is refused: %j",
  (name) => {
    const { code, stdout, stderr, cwd } = run([name]);
    expect(code).toBe(2);
    expect(fs.readdirSync(cwd)).toEqual([]);
    expect(stdout).toBe("");
    expect(stderr).toContain("is not a project name");
    expect(stderr).not.toContain("\x1b");
  },
);

test("no project, or more than one, is a usage error", () => {
  expect(run([]).code).toBe(2);
  expect(run(["a", "b"]).stderr).toBe("usage: biopilot create [--print] <project>\n");
});

jest.setTimeout(60_000);

const cli = (args: string[], cwd = repoRoot) =>
  spawnSync(
    process.execPath,
    ["--import", path.join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs"), path.join(repoRoot, "src", "index.ts"), ...args],
    {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      encoding: "utf-8",
    },
  );

test("the biopilot create command makes the layout in the current folder", () => {
  const cwd = tempDir();
  const run = cli(["create", "proj"], cwd);
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("to enter it: cd proj");
  expect(layoutOf(path.join(cwd, "proj"))).toEqual(PROJECT_FOLDERS);
});

test("biopilot create --print creates nothing; running its line makes the layout and enters it", () => {
  const cwd = tempDir();
  const project = path.join(cwd, "proj");
  const run = cli(["create", "--print", project]);
  expect(run.status).toBe(0);
  expect(fs.readdirSync(cwd)).toEqual([]);
  const sh = spawnSync("sh", ["-c", `${run.stdout.trim()} && pwd -P`], { encoding: "utf-8" });
  expect(sh.status).toBe(0);
  expect(sh.stdout.trim()).toBe(fs.realpathSync(project));
  expect(layoutOf(project)).toEqual(PROJECT_FOLDERS);
});

const noFormats: Parameters<typeof detectProject>[1] = { formatOfFile: () => undefined, matchFiles: () => [] };

/** Runs `biopilot create` for `project`, an absolute path. */
const runLine = (project: string) => run([project]).code;

test("right after biopilot create, the project is recognised from any of its folders, without any hidden file", () => {
  const project = path.join(tempDir(), "proj");
  expect(runLine(project)).toBe(0);
  expect(fs.readdirSync(project).filter((name) => name.startsWith("."))).toEqual([]);
  for (const folder of ["", "data/raw", "results"]) {
    const found = detectProject(path.join(project, folder), noFormats);
    expect(found.root).toBe(project);
    expect(found.marker).toBe(LAYOUT_MARKER);
  }
  expect(detectProject(project, noFormats).folders).toEqual(expect.arrayContaining(["data/raw", "reference", "results"]));
});

test("a partial layout is not a project: data/raw and results alone are common", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "data", "raw"), { recursive: true });
  fs.mkdirSync(path.join(dir, "results"));
  expect(detectProject(path.join(dir, "data", "raw"), noFormats).marker).toBeNull();
});

test("a file named like a layout folder does not count", () => {
  const dir = tempDir();
  for (const folder of ["data/raw", "metadata", "reference"]) fs.mkdirSync(path.join(dir, folder), { recursive: true });
  fs.writeFileSync(path.join(dir, "results"), "");
  expect(detectProject(dir, noFormats).marker).toBeNull();
});

test("a nearer project marker still wins over the layout above it", () => {
  const project = path.join(tempDir(), "proj");
  expect(runLine(project)).toBe(0);
  const pipeline = path.join(project, "scripts", "pipeline");
  fs.mkdirSync(pipeline);
  fs.writeFileSync(path.join(pipeline, "Snakefile"), "");
  expect(detectProject(pipeline, noFormats).root).toBe(pipeline);
});
