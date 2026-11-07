// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot learn <tool> | --list | --forget <tool>`: imports a tool absent from the Catalog from its --help.

import { Command } from "commander";

const cmd = new Command("learn");
cmd
  .description("imports a tool absent from the Catalog from its own --help (--list, --forget <tool>)")
  .argument("[words...]")
  .allowUnknownOption()
  .helpOption(false)
  .action(async (words: string[]) => {
    const { runLearn } = await import("./learnRunner.js");
    process.exitCode = await runLearn(words, {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
      env: process.env,
      cwd: process.cwd(),
    });
  });

export default cmd;
