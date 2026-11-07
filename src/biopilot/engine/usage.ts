// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Usage (spec §6.4): each Catalog option the user accepts is counted under its canonical name, per tool and
// command, in the User store; frequently used options get a bonus, capped at +15 (spec §8.3).

import { openUserStore, type UserStore } from "../profile/userStore.js";
import { getCatalog } from "./catalogAccess.js";

/** Spec §8.3: the usage bonus never exceeds +15. */
export const USAGE_BONUS_CAP = 15;
const BONUS_PER_USE = 3;

export const usageBonus = (count: number): number => Math.min(USAGE_BONUS_CAP, BONUS_PER_USE * count);

/** Counts by `tool\0command`, read once from the User store and kept up to date by this session's records. */
const counts = new Map<string, Map<string, number>>();
let store: UserStore | undefined;
const getStore = (create: boolean): UserStore | undefined => (store ??= openUserStore({ create, createFolder: false }));

const key = (tool: string, command: string) => `${tool}\0${command}`;

/** How often each option of a command was accepted. Never throws. */
export const usageCounts = (tool: string, command: string): Map<string, number> => {
  let known = counts.get(key(tool, command));
  if (!known) {
    known = getStore(false)?.usageCounts(tool, command) ?? new Map();
    counts.set(key(tool, command), known);
  }
  return known;
};

/**
 * Called by the engine (M12) when the user accepts a suggestion on a line: an option of a Catalog Tool is
 * counted, anything else (subcommand, value, other command) is not. Never throws, never blocks for long.
 */
export const recordAcceptedSuggestion = (line: string, suggestion: { name: string }): void => {
  try {
    if (!suggestion.name.startsWith("-")) return;
    const catalog = getCatalog();
    const [toolName, ...words] = line.trim().split(/\s+/);
    const tool = toolName ? catalog?.getTool(toolName) : undefined;
    if (!catalog || !tool) return;
    // The command the option belongs to: the subcommands named on the line, in order.
    let command = catalog.getCommand(tool.name);
    for (const word of words) {
      if (!command || word.startsWith("-")) break;
      const sub = catalog.getCommand(tool.name, [...command.path, word]);
      if (!sub) break;
      command = sub;
    }
    const option = command ? catalog.findOption(command, suggestion.name) : undefined;
    if (!command || !option) return;
    const commandKey = command.path.join(" ");
    const known = usageCounts(tool.name, commandKey);
    known.set(option.canonicalName, (known.get(option.canonicalName) ?? 0) + 1);
    getStore(true)?.addUsage(tool.name, commandKey, option.canonicalName);
  } catch {
    // fail silently: usage is a nicety
  }
};
