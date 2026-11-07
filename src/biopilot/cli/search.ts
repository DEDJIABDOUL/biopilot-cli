// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot search [--json] [--tool <tool>] "<text>"`: finds an option by what it does.

import { Command } from "commander";

const cmd = new Command("search");
cmd
  .description("finds options of the Catalog and of learned tools by their names and descriptions")
  .argument("[words...]")
  .allowUnknownOption()
  .helpOption(false)
  .action(async (words: string[]) => {
    const { runSearch } = await import("./searchRunner.js");
    process.exitCode = await runSearch(words, {
      stdout: (t) => process.stdout.write(t),
      stderr: (t) => process.stderr.write(t),
      env: process.env,
      cwd: process.cwd(),
    });
  });

export default cmd;
