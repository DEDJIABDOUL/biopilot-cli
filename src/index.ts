#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable header/header */

import { Command, Option } from "commander";

import complete from "./commands/complete.js";
import reinit from "./commands/reinit.js";
import uninstall from "./commands/uninstall.js";
import init from "./commands/init.js";
import specs from "./commands/specs/root.js";
import doctor from "./commands/doctor.js";
import { action, supportedShells } from "./commands/root.js";
import { getVersion } from "./utils/version.js";
// BIOPILOT: M9 register BioPilot commands.
import info from "./biopilot/cli/info.js";
import status from "./biopilot/cli/status.js";
import sync from "./biopilot/cli/sync.js";
import computeProfile from "./biopilot/cli/computeProfile.js";

const program = new Command();

const hiddenOption = (flags: string, description: string) => {
  const option = new Option(flags, description);
  option.hidden = true;
  return option;
};

program
  .name("biopilot")
  .description("Terminal autocompletion for bioinformatics tools")
  .version(getVersion(), "-v, --version", "output the current version")
  .action(action(program))
  .option("-l, --login", `start shell as a login shell`)
  .option("-s, --shell <shell>", `shell to use for command execution, supported shells: ${supportedShells}`)
  .option("-c, --check", `check if shell is in a biopilot session`)
  .addOption(hiddenOption("-T, --test", "used to make e2e tests reproducible across machines"))
  .option("-V, --verbose", `enable verbose logging`)
  .passThroughOptions();

program.addCommand(init);
program.addCommand(reinit);
program.addCommand(doctor);
program.addCommand(specs);
program.addCommand(complete);
program.addCommand(uninstall);
program.addCommand(info); // BIOPILOT: M9
program.addCommand(status); // BIOPILOT: M9
program.addCommand(sync); // BIOPILOT: M9
program.addCommand(computeProfile, { hidden: true }); // BIOPILOT: M9, the detached Profile computation

program.parse();
