// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot reset-usage`: erases the usage statistics (spec §9); Profiles stay.

import { Command } from "commander";

const cmd = new Command("reset-usage");
cmd.description("erases the usage statistics BioPilot keeps on this machine").action(async () => {
  const { openUserStore, userStorePath } = await import("../profile/userStore.js");
  const store = openUserStore({ create: false });
  if (!store) {
    process.stdout.write("no usage statistics to erase\n");
    return;
  }
  try {
    store.resetUsage();
    process.stdout.write(`usage statistics erased (${userStorePath()})\n`);
  } catch {
    process.stderr.write(`biopilot: the usage statistics could not be erased from ${userStorePath()}\n`);
    process.exitCode = 1;
  } finally {
    store.close();
  }
});

export default cmd;
