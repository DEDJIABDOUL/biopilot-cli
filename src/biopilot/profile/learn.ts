// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot learn <tool>` (spec §6.4): imports an installed tool absent from the Catalog. BioPilot reads its
// root help, discovers its subcommands (one level, 50 at most), finds how to get its version, records how to
// query it (a Learned tool, shaped like the Catalog's ToolQuery) and computes its Profiles. Only this
// explicit command ever runs an unknown tool (spec §12).

import type { Binary } from "../env/resolver.js";
import { condaMetaVersion, runTool } from "../env/version.js";
import type { ToolQuery } from "../knowledge/catalog.js";
import { computeProfiles } from "./compute.js";
import { parseHelp } from "./helpParser.js";
import { parseSubcommands } from "./subcommandParser.js";
import type { LearnedTool, UserStore } from "./userStore.js";

/** Help commands tried in order; the last, no argument at all, is how bwa and its subcommands print theirs. */
const HELP_ARGS = [["--help"], ["-h"], []];
/** Version commands tried in order (spec §6.4). */
const VERSION_ARGS = [["--version"], ["-V"], ["version"]];
/** A version number: two numbers at least, then what follows them (`2.3.1`, `0.7.19-r1273`, `1.4.0a`). */
const VERSION_REGEX = "(\\d+\\.\\d+(?:\\.\\d+)*(?:[-+][\\w.]+|[a-z]\\w*)?)";
/**
 * Subcommands never run bare to read their help (bwa's way, `bwa mem`): run with no argument, they would act
 * (update the tool, delete caches, download databases, start a server…) instead of printing their usage.
 */
const ACTION_NAME =
  /^(?:self-?)?(?:update|upgrade|install|uninstall|setup|init|config(?:ure)?|clean(?:up)?|clear|purge|prune|reset|rm|remove|delete|download|fetch|pull|push|sync|upload|run|start|stop|serve|server|daemon|restart|kill|test|selftest|build|make|compile|migrate|login|logout|auth)(?:[-_].*)?$/i;
/** Subcommand helps read side by side. */
const PARALLEL = 8;

/** The first help among `candidates` that tells something: options or subcommands. */
const readHelp = async (binary: Binary, candidates: string[][]): Promise<{ args: string[]; text: string } | undefined> => {
  for (const args of candidates) {
    const text = await runTool(binary, args);
    if (text && (parseHelp(text).length > 0 || parseSubcommands(text).length > 0)) return { args, text };
  }
};

/** How to get the version: the first version command whose output carries a version number. */
const versionCommand = async (binary: Binary): Promise<{ args: string[]; regex: string }> => {
  for (const args of VERSION_ARGS) {
    const output = await runTool(binary, args);
    // A tool that doesn't know the command often prints its help instead, whose defaults (`[default: 0.5]`)
    // would pass for a version: an output listing options is not a version.
    if (output && new RegExp(VERSION_REGEX).test(output) && parseHelp(output).length === 0) return { args, regex: VERSION_REGEX };
  }
  return { args: [], regex: "" }; // none: never probed, Profiles keyed by the binary's Fingerprint
};

/** Runs `work` on every item, at most `limit` at a time, keeping their order. */
const mapLimited = async <T, U>(items: T[], limit: number, work: (item: T) => Promise<U>): Promise<U[]> => {
  const results: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
};

export type LearnOutcome = { ok: true; tool: LearnedTool; version: string | undefined } | { ok: false; reason: "no-help" };

export const learnTool = async (name: string, binary: Binary, store: UserStore, now = Date.now()): Promise<LearnOutcome> => {
  const root = await readHelp(binary, HELP_ARGS);
  if (!root) return { ok: false, reason: "no-help" };
  const listed = parseSubcommands(root.text);
  const subcommands = (
    await mapLimited(listed, PARALLEL, async (sub) => {
      const help = await readHelp(binary, [[sub.name, "--help"], [sub.name, "-h"], ...(ACTION_NAME.test(sub.name) ? [] : [[sub.name]])]);
      return help ? { ...sub, args: help.args } : undefined;
    })
  ).filter((sub): sub is NonNullable<typeof sub> => sub !== undefined);
  const version = await versionCommand(binary);
  const query: ToolQuery = {
    package: name,
    versionArgs: version.args,
    versionRegex: version.regex,
    helps: [{ path: [], args: root.args }, ...subcommands.map((sub) => ({ path: [sub.name], args: sub.args }))],
  };
  const tool: LearnedTool = {
    name,
    description: null,
    query,
    subcommands: subcommands.map(({ name: subName, description }) => ({ name: subName, description })),
    learnedAt: now,
  };
  store.putLearnedTool(tool);
  const outcome = await computeProfiles(name, binary, query, store, now);
  return { ok: true, tool, version: condaMetaVersion(binary, name) ?? outcome.version };
};
