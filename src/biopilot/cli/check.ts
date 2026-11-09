// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot check [--json] "<command line>"`: warnings about a command before it runs. The Catalog loads
// only when the command runs.

import { Command } from "commander";

const cmd = new Command("check");
cmd
  .description("warns about a bioinformatics command line before it runs: read pairs, inputs, outputs, indexes, threads")
  .usage('[--json] "<command line>"')
  // The line is taken raw: its options belong to the tool, not to BioPilot.
  .helpOption(false)
  .allowUnknownOption()
  .allowExcessArguments()
  .argument("[words...]")
  .action(async (words: string[]) => {
    const { runCheck } = await import("./checkRunner.js");
    process.exitCode = await runCheck(words, {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
      env: process.env,
      cwd: process.cwd(),
    });
  });

export default cmd;
