// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot uninstall [--yes]`: replaces the engine's command, which only removed the resources folder.

import { Command } from "commander";
import os from "node:os";
import readline from "node:readline/promises";
import sea from "node:sea";

const cmd = new Command("uninstall");
cmd
  .description("removes BioPilot: its configuration, data, shell init lines and standalone binary")
  .option("-y, --yes", "remove without asking")
  .action(async (options: { yes?: boolean }) => {
    const { applyUninstall, describePlan, isEmptyPlan, planUninstall } = await import("./uninstallRunner.js");
    const standalone = sea.isSea();
    const plan = planUninstall({ home: os.homedir(), binary: standalone ? process.execPath : null });
    if (isEmptyPlan(plan)) {
      process.stdout.write("biopilot: nothing to remove\n");
    } else {
      process.stdout.write(`BioPilot will:\n${describePlan(plan)}\n`);
      if (!options.yes) {
        if (!process.stdin.isTTY) {
          process.stderr.write("biopilot: nothing removed; run `biopilot uninstall --yes` to remove all of this without a terminal\n");
          process.exitCode = 1;
          return;
        }
        const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = (await prompt.question("Remove all of this? [y/N] ")).trim().toLowerCase();
        prompt.close();
        if (answer !== "y" && answer !== "yes") {
          process.stdout.write("nothing removed\n");
          return;
        }
      }
      applyUninstall(plan);
      process.stdout.write("✓ BioPilot was removed; open a new terminal to leave the session for good\n");
    }
    // Installed from npm or run from the sources: the command itself belongs to npm.
    if (!standalone) process.stdout.write("to remove the `biopilot` command too, run: npm uninstall -g biopilot-cli\n");
  });

export default cmd;
