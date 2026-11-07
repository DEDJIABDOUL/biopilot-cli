// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot learn`, loaded on demand by the command (see learn.ts).

import { resolveBinary } from "../env/resolver.js";
import { openCatalog } from "../knowledge/catalog.js";
import { learnTool } from "../profile/learn.js";
import { openUserStore, userStorePath } from "../profile/userStore.js";
import type { StatusIO } from "./statusRunner.js";

const USAGE = "usage: biopilot learn <tool> | --list | --forget <tool>\n";

export const runLearn = async (args: readonly string[], io: StatusIO): Promise<number> => {
  const [first, second] = args;
  if (first === undefined) {
    io.stderr(`biopilot: tell which tool to learn\n${USAGE}`);
    return 1;
  }
  const store = openUserStore({ create: first !== "--list" });
  try {
    if (first === "--list") {
      const tools = store?.listLearnedTools() ?? [];
      if (tools.length === 0) io.stdout("no learned tool\n");
      const width = Math.max(0, ...tools.map((tool) => tool.name.length));
      for (const tool of tools) io.stdout(`${tool.name.padEnd(width)}  ${tool.subcommands.map((sub) => sub.name).join(", ") || "(no subcommands)"}\n`);
      return 0;
    }
    if (!store) {
      io.stderr(`biopilot: the User store is unavailable: ${userStorePath()} cannot be created or opened\n`);
      return 1;
    }
    if (first === "--forget") {
      if (!second) {
        io.stderr(`biopilot: tell which tool to forget\n${USAGE}`);
        return 1;
      }
      if (!store.forgetLearnedTool(second)) {
        io.stderr(`biopilot: ${second} is not a learned tool\n`);
        return 1;
      }
      io.stdout(`forgot ${second}\n`);
      return 0;
    }
    const name = first;
    const opened = openCatalog();
    const inCatalog = opened.available && opened.catalog.getTool(name) !== undefined;
    if (opened.available) opened.catalog.close();
    if (inCatalog) {
      io.stderr(`biopilot: ${name} is in the Catalog already: nothing to learn\n`);
      return 1;
    }
    const binary = resolveBinary(name, io.env.PATH);
    if (!binary) {
      io.stderr(`biopilot: ${name} is not on your PATH: activate the environment that has it, then try again\n`);
      return 1;
    }
    io.stdout(`reading the help of ${binary.path}…\n`);
    const outcome = await learnTool(name, binary, store);
    if (!outcome.ok) {
      io.stderr(`biopilot: could not read the help of ${name} (--help, -h or no argument): nothing learned\n`);
      return 1;
    }
    const subs = outcome.tool.subcommands.map((sub) => sub.name);
    const shown = subs.length > 6 ? `${subs.slice(0, 6).join(", ")}, …` : subs.join(", ");
    io.stdout(
      `learned ${name}${outcome.version ? ` ${outcome.version}` : ""}: ${subs.length} subcommand${subs.length === 1 ? "" : "s"}${
        subs.length > 0 ? ` (${shown})` : ""
      }\n`,
    );
    return 0;
  } finally {
    store?.close();
  }
};
