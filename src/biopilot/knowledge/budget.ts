// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Performance budgets of the Catalog (spec §11) and the measure of its reader lookups.
// Used by the tests and `npm run perf:catalog`; never imported by the runtime.

import { performance } from "node:perf_hooks";
import type { Catalog, Command } from "./catalog.js";

/** Spec §11: `knowledge.db` under 5 MB for 50 tools. */
export const CATALOG_SIZE_BUDGET = { bytes: 5_000_000, tools: 50 } as const;

/** Spec §11: a SQLite query under 2 ms. */
export const LOOKUP_BUDGET_MS = 2;

/** Size budget of a Catalog of `toolCount` tools: the 50-tool budget scaled linearly, at least one tool's share. */
export const catalogSizeBudget = (toolCount: number): number => (Math.max(1, toolCount) * CATALOG_SIZE_BUDGET.bytes) / CATALOG_SIZE_BUDGET.tools;

export type LookupTiming = { name: string; samples: number; medianMs: number; p95Ms: number };

const percentile = (sorted: number[], fraction: number) => sorted[Math.min(Math.ceil(sorted.length * fraction) - 1, sorted.length - 1)] ?? 0;

/** Times `samples` calls of `call`, rotating over `probes`, after one warm-up round. */
const time = <P>(name: string, probes: P[], samples: number, call: (probe: P) => unknown): LookupTiming => {
  for (const probe of probes) call(probe);
  const durations: number[] = [];
  for (let i = 0; i < samples; i++) {
    const probe = probes[i % probes.length];
    const start = performance.now();
    call(probe);
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return { name, samples, medianMs: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95) };
};

/**
 * Times the typical lookups of the reader, as a suggestion makes them: resolve a tool's root Command,
 * list its Options, find an Option by alias, recognise a file's format, search Options by text.
 * Probes are drawn from the Catalog itself; a lookup with nothing to probe (no tool, no option) is left out.
 */
export const timeLookups = (catalog: Catalog, samples = 500): LookupTiming[] => {
  const commands = catalog
    .listTools()
    .map((tool) => catalog.getCommand(tool.name))
    .filter((command): command is Command => command !== undefined);
  const aliases = commands.flatMap((command) => {
    const options = catalog.listOptions(command);
    // The last-ranked option's last alias: no better case than any other.
    const alias = options.at(-1)?.aliases.at(-1);
    return alias ? [{ command, alias }] : [];
  });
  // What a user would type: the first word of an option name, e.g. `thread` for `--thread`.
  const words = aliases.flatMap(({ alias }) => alias.match(/[\p{L}\p{N}]+/u)?.[0] ?? []);

  const timings: LookupTiming[] = [];
  if (commands.length > 0) {
    timings.push(time("getCommand", commands, samples, (command) => catalog.getCommand(command.tool)));
    timings.push(time("listOptions", commands, samples, (command) => catalog.listOptions(command)));
  }
  if (aliases.length > 0) timings.push(time("findOption", aliases, samples, ({ command, alias }) => catalog.findOption(command, alias)));
  // A match and a miss (the miss tries every pattern).
  timings.push(time("formatOfFile", ["sample_R1.fastq.gz", "notes.txt"], samples, (file) => catalog.formatOfFile(file)));
  timings.push(time("searchOptions", words.length > 0 ? words : ["thread"], samples, (word) => catalog.searchOptions(word)));
  return timings;
};
