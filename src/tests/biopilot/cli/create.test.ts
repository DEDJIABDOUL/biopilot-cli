// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create <project>` prints the line that lays out a standard project, marks it and enters it; it creates nothing itself.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { createLine, runCreate } from "../../../biopilot/cli/createRunner.js";
import { LAYOUT_MARKER, PROJECT_FOLDERS } from "../../../biopilot/project/layout.js";
import { detectProject } from "../../../biopilot/project/detect.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const run = (args: string[]) => {
  let stdout = "";
  let stderr = "";
  const code = runCreate(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
  return { code, stdout, stderr };
};

test("the line creates every folder of the layout under the project", () => {
  const { code, stdout, stderr } = run(["rnaseq-2026"]);
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
    const { code, stdout, stderr } = run([name]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("is not a project name");
    expect(stderr).not.toContain("\x1b");
  },
);

test("no project, or more than one, is a usage error", () => {
  expect(run([]).code).toBe(2);
  expect(run(["a", "b"]).stderr).toBe("usage: biopilot create <project>\n");
});

jest.setTimeout(60_000);

test("biopilot create prints the line and creates nothing; running the line makes the layout", () => {
  const cwd = tempDir();
  const project = path.join(cwd, "proj");
  const cli = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "create", project], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    encoding: "utf-8",
  });
  expect(cli.status).toBe(0);
  expect(fs.readdirSync(cwd)).toEqual([]);
  const sh = spawnSync("sh", ["-c", `${cli.stdout.trim()} && pwd`], { encoding: "utf-8" });
  expect(sh.status).toBe(0);
  expect(sh.stdout.trim()).toBe(fs.realpathSync(project));
  for (const folder of PROJECT_FOLDERS) expect(fs.statSync(path.join(project, folder)).isDirectory()).toBe(true);
});

const noFormats: Parameters<typeof detectProject>[1] = { formatOfFile: () => undefined, matchFiles: () => [] };

/** Runs the line `biopilot create` prints for `project`, in sh. */
const runLine = (project: string) => {
  const result = createLine(project);
  if (!result.ok) throw new Error(result.error);
  return spawnSync("sh", ["-c", result.line]).status;
};

test("right after the line, the project is recognised from any of its folders, without any hidden file", () => {
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
