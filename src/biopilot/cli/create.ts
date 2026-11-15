// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create <project>`: prints the line that creates a standard bioinformatics project layout and enters it.

import { Command } from "commander";

const cmd = new Command("create");
cmd
  .description("prints the command that creates a standard bioinformatics project layout and enters it")
  .argument("[project...]")
  .action(async (args: string[]) => {
    const { runCreate } = await import("./createRunner.js");
    process.exitCode = runCreate(args, {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
    });
  });

export default cmd;
