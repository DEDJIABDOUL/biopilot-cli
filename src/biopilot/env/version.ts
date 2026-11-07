// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The version of an installed binary (spec §7.2): from conda-meta without running anything, else from
// the Tool's declared version command.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ToolQuery } from "../knowledge/catalog.js";
import type { Binary } from "./resolver.js";

/** Spec §7.2, §12: a tool is never given more than this, and never stdin. */
export const TOOL_TIMEOUT_MS = 2_500;

export type VersionSource = "conda-meta" | "version-command";
export type DetectedVersion = { version: string; source: VersionSource };

/**
 * Runs an installed binary with the given arguments (only a declared version or help command), stdin
 * closed, at most 2.5 s. Its stdout and stderr together, or nothing if it could not run or timed out.
 */
export const runTool = (binary: Binary, args: readonly string[]): string | undefined => {
  try {
    const run = spawnSync(binary.path, args, { stdio: ["ignore", "pipe", "pipe"], timeout: TOOL_TIMEOUT_MS, encoding: "utf-8", maxBuffer: 8 * 1024 * 1024 });
    if (run.error) return;
    return `${run.stdout ?? ""}${run.stderr ?? ""}`;
  } catch {
    return;
  }
};

/** The conda environments the binary may belong to: the folder above its `bin/`, as found and as real. */
const prefixes = (binary: Binary) => [...new Set([binary.path, binary.realPath].map((file) => path.dirname(path.dirname(file))))];

/** The version recorded by conda for `pkg` in the binary's environment; nothing is run. */
export const condaMetaVersion = (binary: Binary, pkg: string): string | undefined => {
  for (const prefix of prefixes(binary)) {
    const meta = path.join(prefix, "conda-meta");
    let files: string[];
    try {
      files = fs.readdirSync(meta).filter((file) => file.startsWith(`${pkg}-`) && file.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(meta, file), "utf-8")) as { name?: unknown; version?: unknown };
        if (record.name === pkg && typeof record.version === "string") return record.version;
      } catch {
        // a damaged record: try the next one
      }
    }
  }
};

/** The version printed by the Tool's declared version command, read with its regular expression. */
export const probeVersion = (binary: Binary, query: ToolQuery): string | undefined => {
  const output = runTool(binary, query.versionArgs);
  if (output === undefined) return;
  try {
    return new RegExp(query.versionRegex, "m").exec(output)?.[1];
  } catch {
    return;
  }
};

/** conda-meta first; the version command only when `probe` is allowed (never on a keystroke). */
export const detectVersion = (binary: Binary, query: ToolQuery, { probe }: { probe: boolean }): DetectedVersion | undefined => {
  const fromConda = condaMetaVersion(binary, query.package);
  if (fromConda) return { version: fromConda, source: "conda-meta" };
  const probed = probe ? probeVersion(binary, query) : undefined;
  return probed ? { version: probed, source: "version-command" } : undefined;
};
