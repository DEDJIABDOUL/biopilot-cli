// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Computes an unknown Profile in a detached BioPilot process (ADR-0002): the keystroke never waits, there
// is no daemon, and a binary is handed to it at most once per session, whatever the outcome.

import { spawn } from "node:child_process";
import path from "node:path";
import sea from "node:sea";
import { fileURLToPath } from "node:url";
import type { Binary } from "../env/resolver.js";

/** Name of the hidden internal command the detached process runs. */
export const COMPUTE_PROFILE_COMMAND = "compute-profile";

/** Fingerprints already handed to a detached process in this session. */
const requested = new Set<string>();

/** How to start BioPilot itself: the standalone binary, the build, or the sources (through tsx). */
const biopilotCommand = (): { file: string; args: string[]; cwd?: string } => {
  if (sea.isSea()) return { file: process.execPath, args: [] };
  const here = fileURLToPath(import.meta.url);
  const extension = path.extname(here);
  const entry = path.resolve(path.dirname(here), "..", "..", `index${extension}`);
  // From the sources, `--import tsx` is resolved from the repository root.
  return extension === ".ts"
    ? { file: process.execPath, args: ["--import", "tsx", entry], cwd: path.resolve(path.dirname(entry), "..") }
    : { file: process.execPath, args: [entry] };
};

/**
 * Starts the computation of a Tool's Profiles for this binary, unless already started in this session.
 * `pathValue`: the session's PATH, so that the process finds the same binary. Never throws.
 */
export const requestProfile = (tool: string, binary: Binary, pathValue: string | undefined): void => {
  if (requested.has(binary.fingerprint)) return;
  requested.add(binary.fingerprint);
  try {
    const { file, args, cwd } = biopilotCommand();
    const child = spawn(file, [...args, COMPUTE_PROFILE_COMMAND, tool], {
      detached: true,
      stdio: "ignore",
      cwd,
      env: { ...process.env, PATH: pathValue ?? "" },
    });
    child.on("error", () => {}); // could not start: the Catalog stays shown, nothing retried
    child.unref();
  } catch {
    // fail silently
  }
};
