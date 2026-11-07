// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot sync`, loaded on demand by the command (see sync.ts).

import chalk from "chalk";
import { resolveBinary } from "../env/resolver.js";
import { openCatalog } from "../knowledge/catalog.js";
import { computeProfiles } from "../profile/compute.js";
import { openUserStore, userStorePath } from "../profile/userStore.js";
import type { StatusIO } from "./statusRunner.js";

export const runSync = async (io: StatusIO): Promise<number> => {
  const opened = openCatalog();
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return 1;
  }
  const { catalog } = opened;
  const store = openUserStore({ create: true });
  if (!store) {
    catalog.close();
    io.stderr(`biopilot: the User store is unavailable: ${userStorePath()} cannot be created or opened\n`);
    return 1;
  }
  try {
    const tools = catalog.listTools();
    const width = Math.max(0, ...tools.map((tool) => tool.name.length));
    for (const { name } of tools) {
      const binary = resolveBinary(name, io.env.PATH);
      const query = catalog.getToolQuery(name);
      const label = chalk.bold(name.padEnd(width));
      if (!binary || !query) {
        io.stdout(`${label}  ${chalk.dim("not installed")}\n`);
        continue;
      }
      const outcome = await computeProfiles(name, binary, query, store);
      const status = outcome.status === "failed" ? chalk.red("failed") : outcome.status === "computed" ? chalk.green("computed") : "known";
      io.stdout(`${label}  ${status}  ${outcome.version ?? "unknown version"}`.trimEnd() + "\n");
    }
    return 0;
  } finally {
    store.close();
    catalog.close();
  }
};
