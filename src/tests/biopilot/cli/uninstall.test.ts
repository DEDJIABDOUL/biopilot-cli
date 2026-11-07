// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot uninstall` leaves the system as it was (ticket #57): configuration, data (profiles and usage
// included), the shell init lines and the standalone binary, after showing them. In a temporary HOME.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { planUninstall, applyUninstall } from "../../../biopilot/cli/uninstallRunner.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** A home where BioPilot was installed and used: config, data, init lines among the user's own. */
const installedHome = () => {
  const home = tempDir();
  const write = (file: string, content = "") => {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), content);
  };
  write(".config/biopilot/rc.toml", "[bindings]\n");
  write(".local/share/biopilot/knowledge.db");
  write(".local/share/biopilot/user.db");
  write(".local/share/biopilot/init/bash/init.sh");
  write(
    ".bashrc",
    `export EDITOR=vim\n[ -f '${home}/.local/share/biopilot/init/bash/init.sh' ] && source '${home}/.local/share/biopilot/init/bash/init.sh'\nalias ll='ls -l'\n`,
  );
  write(".zshrc", "# biopilot shell plugin\n[[ -f ~/.biopilot/init/zsh/init.zsh ]] && source ~/.biopilot/init/zsh/init.zsh\nsetopt autocd\n");
  write(".config/fish/config.fish", "set -gx EDITOR vim\n");
  write(".config/other/keep.txt", "not BioPilot's");
  return home;
};

const uninstall = (home: string, ...args: string[]) =>
  spawnSync(
    process.execPath,
    ["--import", path.join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs"), path.join(repoRoot, "src", "index.ts"), "uninstall", ...args],
    {
      cwd: repoRoot,
      env: { PATH: process.env.PATH ?? "", HOME: home, FORCE_COLOR: "0" },
      encoding: "utf-8",
    },
  );

jest.setTimeout(60_000);

describe("biopilot uninstall", () => {
  test("--yes removes the configuration, the data and the init lines, and nothing else", () => {
    const home = installedHome();
    const run = uninstall(home, "--yes");
    expect(run.status).toBe(0);
    expect(fs.existsSync(path.join(home, ".config", "biopilot"))).toBe(false);
    expect(fs.existsSync(path.join(home, ".local", "share", "biopilot"))).toBe(false);
    expect(fs.readFileSync(path.join(home, ".bashrc"), "utf-8")).toBe("export EDITOR=vim\nalias ll='ls -l'\n");
    expect(fs.readFileSync(path.join(home, ".zshrc"), "utf-8")).toBe("setopt autocd\n");
    expect(fs.readFileSync(path.join(home, ".config", "fish", "config.fish"), "utf-8")).toBe("set -gx EDITOR vim\n");
    expect(fs.existsSync(path.join(home, ".config", "other", "keep.txt"))).toBe(true);
  });

  test("it says what it removes; from npm or the sources, it says how to remove the command", () => {
    const run = uninstall(installedHome(), "--yes");
    expect(run.stdout).toContain(".local/share/biopilot");
    expect(run.stdout).toContain(".bashrc");
    expect(run.stdout).toContain("npm uninstall -g biopilot-cli");
  });

  test("without a terminal and without --yes, nothing is removed", () => {
    const home = installedHome();
    const run = uninstall(home);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--yes");
    expect(fs.existsSync(path.join(home, ".local", "share", "biopilot", "user.db"))).toBe(true);
    expect(fs.readFileSync(path.join(home, ".bashrc"), "utf-8")).toContain("biopilot/init/bash");
  });

  test("nothing installed: nothing to do, and that is fine", () => {
    const run = uninstall(tempDir(), "--yes");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("nothing to remove");
  });
});

describe("the standalone binary", () => {
  test("is removed with the rest when BioPilot runs as one", () => {
    const home = installedHome();
    const binary = path.join(home, ".local", "bin", "biopilot");
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "binary");
    const plan = planUninstall({ home, binary });
    expect(plan.binary).toBe(binary);
    applyUninstall(plan);
    expect(fs.existsSync(binary)).toBe(false);
    expect(fs.existsSync(path.join(home, ".local", "bin"))).toBe(true); // the folder is the user's
  });
});
