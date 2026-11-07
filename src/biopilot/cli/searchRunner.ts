// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot search "<text>" [--tool <tool>] [--json]` (spec §9): the options of the
// Catalog (full-text index) and of learned tools (their Profiles) whose names or descriptions hold every word.

import { openCatalog } from "../knowledge/catalog.js";
import { openUserStore } from "../profile/userStore.js";
import type { StatusIO } from "./statusRunner.js";

/** Version of the `--json` output contract. */
export const SEARCH_JSON_FORMAT = 1;
const LIMIT = 20;
const USAGE = 'usage: biopilot search [--json] [--tool <tool>] "<text>"\n';

type Result = { tool: string; command: string[]; names: string[]; description: string | null; source: "catalog" | "learned" };

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Learned tools' options holding every word (the last as a prefix), from each command's latest Profile. */
const searchLearned = (query: string[], tool: string | undefined): Result[] => {
  const store = openUserStore({ create: false });
  if (!store) return [];
  try {
    const results: Result[] = [];
    for (const learned of store.listLearnedTools()) {
      if (tool && learned.name !== tool) continue;
      const latest = new Map<string, (typeof results)[number][]>();
      for (const profile of store.listProfiles(learned.name)) {
        if (latest.has(profile.command)) continue; // most recent first: the newest version wins
        latest.set(
          profile.command,
          profile.options
            .filter((option) => {
              const text = words(`${option.names.join(" ")} ${option.description ?? ""}`);
              return query.every((word, i) => text.some((t) => (i === query.length - 1 ? t.startsWith(word) : t === word)));
            })
            .map((option) => {
              const long = option.names.filter((name) => name.startsWith("--"));
              return {
                tool: learned.name,
                command: profile.command ? profile.command.split(" ") : [],
                names: [...long, ...option.names.filter((name) => !name.startsWith("--"))],
                description: option.description,
                source: "learned" as const,
              };
            }),
        );
      }
      for (const found of latest.values()) results.push(...found);
    }
    return results;
  } finally {
    store.close();
  }
};

export const runSearch = async (args: readonly string[], io: StatusIO): Promise<number> => {
  let json = false;
  let tool: string | undefined;
  const text: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--tool") tool = args[++i];
    else text.push(args[i]);
  }
  const query = words(text.join(" "));
  if (query.length === 0) {
    io.stderr(`biopilot: tell what to search\n${USAGE}`);
    return 1;
  }
  const opened = openCatalog();
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return 1;
  }
  let results: Result[];
  try {
    results = opened.catalog
      .searchOptions(query.join(" "), tool ? 200 : LIMIT)
      .filter((found) => !tool || found.command.tool === tool)
      .map(({ command, option }) => ({
        tool: command.tool,
        command: command.path,
        names: [option.canonicalName, ...option.aliases.filter((alias) => alias !== option.canonicalName)],
        description: option.description,
        source: "catalog" as const,
      }));
  } finally {
    opened.catalog.close();
  }
  // Learned tools keep up to half of the places: the Catalog alone could fill them all.
  const learned = searchLearned(query, tool).slice(0, LIMIT / 2);
  results = [...results.slice(0, LIMIT - learned.length), ...learned];

  if (json) {
    io.stdout(JSON.stringify({ format: SEARCH_JSON_FORMAT, query: text.join(" "), results }, null, 2) + "\n");
    return 0;
  }
  if (results.length === 0) {
    io.stdout(`no option matches "${text.join(" ")}"\n`);
    return 0;
  }
  const where = results.map((result) => [result.tool, ...result.command].join(" "));
  const names = results.map((result) => result.names.join(", "));
  const whereWidth = Math.max(...where.map((w) => w.length));
  const namesWidth = Math.min(40, Math.max(...names.map((n) => n.length)));
  results.forEach((result, i) => io.stdout(`${where[i].padEnd(whereWidth)}  ${names[i].padEnd(namesWidth)}  ${result.description ?? ""}`.trimEnd() + "\n"));
  return 0;
};
