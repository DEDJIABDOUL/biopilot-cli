// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Unreadable or broken files never break suggestions (ticket #65), and the prompt runs no external command
// (spec §11, M2: the integrations only use shell builtins).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
const store = path.join(tempDir(), "user.db");

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = store;
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string, cwd: string) => ((await runtime.getSuggestions(line, cwd, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

describe("broken files", () => {
  test("an unreadable folder in the project: suggestions still come", async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, ".git"));
    fs.mkdirSync(path.join(root, "locked"));
    fs.writeFileSync(path.join(root, "reads_R1.fq"), "");
    fs.chmodSync(path.join(root, "locked"), 0o000);
    try {
      expect(await names("fastp --in1 ", root)).toContain("reads_R1.fq");
      expect((await names("fastp --", root))[0]).toBe("--in1");
    } finally {
      fs.chmodSync(path.join(root, "locked"), 0o755);
    }
  });

  test("a User store corrupted during the session: suggestions still come", async () => {
    expect((await names("fastp --", tempDir()))[0]).toBe("--in1");
    fs.writeFileSync(store, "this is not a database anymore");
    expect((await names("samtools sort -", tempDir())).slice(0, 2)).toEqual(["-o", "--threads"]);
    expect((await names("fastp --", tempDir()))[0]).toBe("--in1");
  });
});

/** Runs the shell's integration then its prompt hook with an empty PATH: any external command fails. */
const promptWithoutPath = (shell: string, script: string) => {
  const home = tempDir();
  return spawnSync(shell, ["-c", script], { env: { HOME: home, PATH: process.env.PATH ?? "" }, encoding: "utf-8", cwd: repoRoot });
};
const hasShell = (shell: string) => spawnSync("sh", ["-c", `command -v ${shell}`]).status === 0;

describe("the prompt runs no external command (M2)", () => {
  test("bash", () => {
    const run = promptWithoutPath("bash", `. shell/shellIntegration.bash; PATH=""; __is_precmd`);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("\u001b]6973;ENV;");
  });

  (hasShell("zsh") ? test : test.skip)("zsh", () => {
    const run = promptWithoutPath("zsh", `source shell/shellIntegration-rc.zsh; PATH=""; __is_precmd`);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("\u001b]6973;ENV;");
  });

  (hasShell("fish") ? test : test.skip)("fish", () => {
    const run = promptWithoutPath("fish", `source shell/shellIntegration.fish; set -e PATH; set PATH; __is_update_cwd; __is_update_env`);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("\u001b]6973;ENV;");
  });
});
