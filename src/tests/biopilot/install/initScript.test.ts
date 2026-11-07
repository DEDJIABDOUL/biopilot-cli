// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The shell init script, the one line users add to their startup file: it starts `biopilot` (the engine's
// template still called the original `is` command, so every new terminal closed at once), and it never
// closes the terminal when BioPilot is missing or its session cannot start.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getShellConfig, Shell } from "../../../utils/shell.js";
import { tempDir } from "../helpers.js";

describe("the shell init script", () => {
  test.each([Shell.Bash, Shell.Zsh, Shell.Fish])("%s starts biopilot, never the original command", (shell) => {
    const script = getShellConfig(shell);
    expect(script).toContain(`biopilot -s ${shell}`);
    expect(script).not.toMatch(/(^|[\s;{])is -s/m);
  });

  const hasShell = (shell: string) => spawnSync("sh", ["-c", `command -v ${shell}`]).status === 0;
  const shellDir = (shell: string) => path.dirname(spawnSync("sh", ["-c", `command -v ${shell}`], { encoding: "utf-8" }).stdout.trim());
  const ARGS: Record<string, string[]> = { bash: ["--norc", "-i"], zsh: ["-f", "-i"], fish: ["--no-config", "-i"] };

  /** Sources the init script in an interactive shell, then runs `echo alive`; with `bin` first on PATH. */
  const interactive = (shell: string, bin: string) => {
    const home = tempDir();
    const init = path.join(home, "init");
    fs.writeFileSync(init, getShellConfig(shell as Shell));
    // Commands on stdin, not `-c`: the init script rightly does nothing in a `bash -c`.
    return spawnSync(shell, ARGS[shell], {
      input: `source ${init}\necho alive\n`,
      env: { HOME: home, PATH: `${bin}:${shellDir(shell)}:/usr/bin:/bin`, TERM: "dumb" },
      encoding: "utf-8",
    }).stdout;
  };
  const fakeBiopilot = (exitCode: number) => {
    const bin = tempDir();
    fs.writeFileSync(path.join(bin, "biopilot"), `#!/bin/sh\necho 'biopilot resources out of date' >&2\nexit ${exitCode}\n`, { mode: 0o755 });
    return bin;
  };

  describe.each(["bash", "zsh", "fish"])("in %s", (shell) => {
    const run = hasShell(shell) ? test : test.skip;

    run("without biopilot on PATH, the shell goes on as usual", () => {
      expect(interactive(shell, tempDir())).toContain("alive");
    });

    run("when the session cannot start (e.g. resources out of date), the shell goes on", () => {
      expect(interactive(shell, fakeBiopilot(1))).toContain("alive");
    });

    run("when the session ends normally, the shell it replaced ends too", () => {
      expect(interactive(shell, fakeBiopilot(0))).not.toContain("alive");
    });
  });
});
