// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import os from "node:os";
import { Command } from "commander";
import { Shell } from "../utils/shell.js";
import { initializeRuntime } from "../runtime/initialize.js";
import { loadConfig } from "../utils/config.js";

const action = async (input: string) => {
  // BIOPILOT: M8 load the configuration like a session, and print an empty result instead of crashing.
  await loadConfig(cmd);
  const shell = os.platform() === "win32" ? Shell.Cmd : Shell.Bash;
  const { getSuggestions } = await initializeRuntime(shell);
  const suggestions = await getSuggestions(input, process.cwd(), shell);
  process.stdout.write(JSON.stringify(suggestions ?? { suggestions: [] }));
  process.exit(0);
};

const cmd = new Command("complete");
cmd.description(`generates a completion for the provided input`);
cmd.argument("<input>");
cmd.action(action);

export default cmd;
