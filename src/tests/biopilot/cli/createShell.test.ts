// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// In a BioPilot session, `biopilot create --print <project>` creates the project and enters it: the shell
// integration's `biopilot` function runs the printed line in the shell itself. Tested in real bash, zsh and fish.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { PROJECT_FOLDERS } from "../../../biopilot/project/layout.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const SHELLS = [
  { shell: "bash", file: "shellIntegration.bash" },
  { shell: "zsh", file: "shellIntegration-rc.zsh" },
  { shell: "fish", file: "shellIntegration.fish" },
];

/** The `biopilot` function of an integration script, between its markers. */
const functionOf = (file: string): string => {
  const text = fs.readFileSync(path.join(repoRoot, "shell", file), "utf-8");
  const begin = text.indexOf("# BIOPILOT: create-cd begin");
  const end = text.indexOf("# BIOPILOT: create-cd end");
  if (begin < 0 || end < begin) throw new Error(`no create-cd function in ${file}`);
  return text.slice(begin, end);
};

/** A folder holding a `biopilot` that runs this source tree, put first on the PATH. */
const fakeBin = (): string => {
  const bin = tempDir();
  const tsx = path.join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs");
  fs.writeFileSync(path.join(bin, "biopilot"), `#!/bin/sh\nexec "${process.execPath}" --import "${tsx}" "${path.join(repoRoot, "src", "index.ts")}" "$@"\n`, {
    mode: 0o755,
  });
  return bin;
};

const available = (shell: string) => spawnSync(shell, ["-c", "exit 0"]).status === 0;

/** Runs `script` in `shell` after defining the function, in `cwd`; stdout and status. */
const runIn = (shell: string, file: string, script: string, cwd: string) => {
  const fn = path.join(tempDir(), "fn");
  fs.writeFileSync(fn, functionOf(file));
  const source = shell === "fish" ? `source ${fn}` : `. ${fn}`;
  const args = shell === "fish" ? ["--no-config", "-c", `${source}; ${script}`] : ["-c", `${source}; ${script}`];
  return spawnSync(shell, args, {
    cwd,
    env: { ...process.env, PATH: `${fakeBin()}${path.delimiter}${process.env.PATH ?? ""}`, FORCE_COLOR: "0", ZDOTDIR: tempDir() },
    encoding: "utf-8",
  });
};

jest.setTimeout(120_000);

describe.each(SHELLS)("$shell", ({ shell, file }) => {
  const maybe = available(shell) ? test : test.skip;

  maybe("biopilot create --print <project> creates the project and enters it", () => {
    const cwd = tempDir();
    const run = runIn(shell, file, "biopilot create --print magic; pwd -P", cwd);
    expect(run.status).toBe(0);
    const lines = run.stdout.trim().split("\n");
    expect(lines[0]).toMatch(/^mkdir -p magic\/data\/raw .* && cd magic$/);
    expect(lines[lines.length - 1]).toBe(fs.realpathSync(path.join(cwd, "magic")));
    for (const folder of PROJECT_FOLDERS) expect(fs.statSync(path.join(cwd, "magic", folder)).isDirectory()).toBe(true);
  });

  maybe("--print after the project name works too", () => {
    const cwd = tempDir();
    const run = runIn(shell, file, "biopilot create magic --print; pwd -P", cwd);
    expect(run.status).toBe(0);
    expect(run.stdout.trim().split("\n").pop()).toBe(fs.realpathSync(path.join(cwd, "magic")));
  });

  maybe("biopilot create <project> without --print creates it and stays in the folder", () => {
    const cwd = tempDir();
    const run = runIn(shell, file, "biopilot create magic; pwd -P", cwd);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("to enter it: cd magic");
    expect(run.stdout.trim().split("\n").pop()).toBe(fs.realpathSync(cwd));
    expect(fs.statSync(path.join(cwd, "magic", "data", "raw")).isDirectory()).toBe(true);
  });

  maybe("a refused name creates nothing, changes no folder, and keeps its exit code", () => {
    const cwd = tempDir();
    const run = runIn(shell, file, `biopilot create --print 'a;touch pwned'; echo status=${shell === "fish" ? "$status" : "$?"}; pwd -P`, cwd);
    expect(run.stdout).toMatch(/status=2/);
    expect(run.stdout.trim().split("\n").pop()).toBe(fs.realpathSync(cwd));
    expect(fs.readdirSync(cwd)).toEqual([]);
  });

  maybe("an option in the name's place is passed on, never run as a line", () => {
    const cwd = tempDir();
    const run = runIn(shell, file, "biopilot create --help --print; pwd -P", cwd);
    expect(run.stdout).toContain("Usage: biopilot create");
    expect(run.stdout.trim().split("\n").pop()).toBe(fs.realpathSync(cwd));
    expect(fs.readdirSync(cwd)).toEqual([]);
  });

  maybe("other biopilot commands are passed on as they are", () => {
    const run = runIn(shell, file, "biopilot -c", tempDir());
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^biopilot session \[(live|not found)\]/);
  });
});
