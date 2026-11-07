// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Hidden internal command run by the detached computation (ADR-0002): computes a Tool's Profiles for the
// binary its PATH leads to, into the User store. Silent; exit code 0 on success, 1 otherwise.

import { Command } from "commander";
import { COMPUTE_PROFILE_COMMAND } from "../profile/detached.js";

const cmd = new Command(COMPUTE_PROFILE_COMMAND);
cmd.argument("<tool>").action(async (tool: string) => {
  const [{ resolveBinary }, { openCatalog }, { computeProfiles }, { openUserStore }] = await Promise.all([
    import("../env/resolver.js"),
    import("../knowledge/catalog.js"),
    import("../profile/compute.js"),
    import("../profile/userStore.js"),
  ]);
  const opened = openCatalog();
  const binary = resolveBinary(tool, process.env.PATH);
  const query = opened.available ? opened.catalog.getToolQuery(tool) : undefined;
  // Never a folder: the data folder exists in an installed BioPilot, and a computation finishing after its
  // folder was removed (tests, uninstall) must not bring it back.
  const store = binary && query ? openUserStore({ create: true, createFolder: false }) : undefined;
  try {
    process.exitCode = binary && query && store && computeProfiles(tool, binary, query, store).status !== "failed" ? 0 : 1;
  } finally {
    store?.close();
    if (opened.available) opened.catalog.close();
  }
});

export default cmd;
