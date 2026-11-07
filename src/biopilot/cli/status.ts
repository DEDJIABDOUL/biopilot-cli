// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot status [--json]`: the active environment and, per Catalog Tool, the binary the shell would run
// and its version. Loaded on demand, like `info`.

import { Command } from "commander";

const cmd = new Command("status");
cmd
  .description("shows the active environment and the bio tools and versions BioPilot detects in it")
  .option("--json", "output JSON")
  .action(async (options: { json?: boolean }) => {
    const { runStatus } = await import("./statusRunner.js");
    process.exitCode = runStatus(
      { json: options.json === true },
      { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t), env: process.env, cwd: process.cwd() },
    );
  });

export default cmd;
