// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The version of an installed binary (spec §7.2): from conda-meta without running anything, else from
// the Tool's declared version command.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ToolQuery } from "../knowledge/catalog.js";
import type { Binary } from "./resolver.js";

/** Spec §7.2, §12: a tool is never given more than this, and never stdin. */
export const TOOL_TIMEOUT_MS = 2_500;

export type VersionSource = "conda-meta" | "version-command";
export type DetectedVersion = { version: string; source: VersionSource };

/** A help bigger than this is no help: the tool is stopped and nothing is read. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Runs an installed binary with the given arguments (only a declared version or help command), stdin
 * closed, at most 2.5 s. Its stdout and stderr together, or nothing if it could not run, timed out or
 * flooded. The tool runs in a process group of its own, killed as a whole when it is stopped: a wrapper's
 * children (fastqc's java) are never left behind. Never rejects.
 */
export const runTool = (binary: Binary, args: readonly string[]): Promise<string | undefined> =>
  new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary.path, [...args], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    } catch {
      resolve(undefined);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (output: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The whole group: the tool and whatever it started.
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      resolve(output);
    };
    const timer = setTimeout(() => finish(undefined), TOOL_TIMEOUT_MS);
    const collect = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) finish(undefined);
      else chunks.push(chunk);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("error", () => finish(undefined));
    // `close`: the tool exited and its output was read to the end.
    child.on("close", () => finish(Buffer.concat(chunks).toString("utf-8")));
  });

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
export const probeVersion = async (binary: Binary, query: ToolQuery): Promise<string | undefined> => {
  // No version command known (a learned tool that answered none): never run anything to guess one.
  if (query.versionRegex === "") return;
  const output = await runTool(binary, query.versionArgs);
  if (output === undefined) return;
  try {
    return new RegExp(query.versionRegex, "m").exec(output)?.[1];
  } catch {
    return;
  }
};

/** conda-meta first; the version command only when `probe` is allowed (never on a keystroke). */
export const detectVersion = async (binary: Binary, query: ToolQuery, { probe }: { probe: boolean }): Promise<DetectedVersion | undefined> => {
  const fromConda = condaMetaVersion(binary, query.package);
  if (fromConda) return { version: fromConda, source: "conda-meta" };
  const probed = probe ? await probeVersion(binary, query) : undefined;
  return probed ? { version: probed, source: "version-command" } : undefined;
};
