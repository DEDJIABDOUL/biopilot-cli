// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot info [--json] [tool] [command…] [option]`. The Catalog (and SQLite) load only when the
// command runs, so registering it costs nothing at session startup.

import { Command } from "commander";

const cmd = new Command("info");
cmd
  .description("shows what the Catalog knows about a bio tool, command or option")
  .usage("[--json] [tool] [command…] [option]")
  // Words are taken raw: options after the tool name belong to the tool, not to BioPilot.
  .helpOption(false)
  .allowUnknownOption()
  .allowExcessArguments()
  .argument("[words...]")
  .action(async (words: string[]) => {
    const { runInfo } = await import("./infoRunner.js");
    process.exitCode = runInfo(words, { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) });
  });

export default cmd;
