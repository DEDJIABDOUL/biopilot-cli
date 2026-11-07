// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Computes the Profiles of an installed Tool: its version, then each Command's --help, parsed (spec §6.4).
// Shared by `biopilot sync` and the detached computation.

import type { Binary } from "../env/resolver.js";
import { condaMetaVersion, probeVersion, runTool } from "../env/version.js";
import type { ToolQuery } from "../knowledge/catalog.js";
import { parseHelp } from "./helpParser.js";
import { versionKey, type UserStore } from "./userStore.js";

/** The version of a binary for Profiles: conda-meta, else the version probed once per Fingerprint. */
export const knownVersion = (binary: Binary, query: ToolQuery, store: UserStore | undefined): string | undefined =>
  condaMetaVersion(binary, query.package) ?? store?.probedVersion(binary.fingerprint) ?? undefined;

export type ComputeOutcome = { status: "computed" | "known" | "failed"; version: string | undefined; computed: number };

/**
 * Makes sure every Command of the Tool with a help command has a Profile for this binary's version.
 * A help that prints something is stored even with no option in it (computed once, never retried);
 * a help that cannot run or times out stores nothing.
 */
export const computeProfiles = async (tool: string, binary: Binary, query: ToolQuery, store: UserStore, now = Date.now()): Promise<ComputeOutcome> => {
  let version = knownVersion(binary, query, store);
  if (version === undefined && store.probedVersion(binary.fingerprint) === undefined) {
    const probed = await probeVersion(binary, query);
    store.putProbedVersion(binary.fingerprint, tool, probed ?? null);
    version = probed;
  }
  const key = versionKey(version, binary.fingerprint);
  let computed = 0;
  let failed = 0;
  for (const help of query.helps) {
    const command = help.path.join(" ");
    if (store.getProfile(tool, key, command)) continue;
    const output = await runTool(binary, help.args);
    if (output === undefined || output.trim() === "") {
      failed++;
      continue;
    }
    store.putProfile({ tool, version: key, command, options: parseHelp(output), fingerprint: binary.fingerprint, createdAt: now });
    computed++;
  }
  return { status: failed > 0 && computed === 0 ? "failed" : computed > 0 ? "computed" : "known", version, computed };
};

/** Whether every Command with a help command has a Profile for this version. */
export const profilesKnown = (tool: string, binary: Binary, query: ToolQuery, store: UserStore | undefined): boolean => {
  if (!store) return false;
  const key = versionKey(knownVersion(binary, query, store), binary.fingerprint);
  return query.helps.every((help) => store.getProfile(tool, key, help.path.join(" ")) !== undefined);
};
