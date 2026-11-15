// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create [--print] <project>`: creates the folders of a standard bioinformatics project layout.

import { Command } from "commander";

const cmd = new Command("create");
cmd
  .description("creates the folders of a standard bioinformatics project (data/raw, metadata, reference, results…)")
  .argument("[project...]")
  .option("--print", "print the mkdir -p … && cd … command; in a BioPilot session, the shell runs it: the project is created and entered")
  .action(async (args: string[], options: { print?: boolean }) => {
    const { runCreate } = await import("./createRunner.js");
    process.exitCode = runCreate(args, options, {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
      cwd: process.cwd(),
    });
  });

export default cmd;
