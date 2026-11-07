// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot sync`: computes ahead of time the Profiles of the active environment's Catalog Tools.

import { Command } from "commander";

const cmd = new Command("sync");
cmd.description("computes the profiles (real options) of the bio tools installed in the active environment").action(async () => {
  const { runSync } = await import("./syncRunner.js");
  process.exitCode = await runSync({ stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t), env: process.env, cwd: process.cwd() });
});

export default cmd;
