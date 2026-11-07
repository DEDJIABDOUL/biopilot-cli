// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Which binary the shell would run for a Tool (spec §7.1), and its Fingerprint.

import fs from "node:fs";
import path from "node:path";

/** An installed binary: where `PATH` finds it, where it really lives, and its Fingerprint. */
export type Binary = {
  /** As found in `PATH` (a conda environment's `bin/`, for instance). */
  path: string;
  realPath: string;
  /** Real path, size and modification time: tells whether a known Profile still applies. */
  fingerprint: string;
};

/**
 * The first executable `name` in `pathValue`, as the shell would pick it. Relative entries are skipped,
 * so the current folder never decides what BioPilot inspects. Never throws.
 */
export const resolveBinary = (name: string, pathValue: string | undefined): Binary | undefined => {
  if (!pathValue || name.includes("/")) return;
  for (const dir of pathValue.split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const realPath = fs.realpathSync(candidate);
      const stat = fs.statSync(realPath);
      if (!stat.isFile()) continue;
      return { path: candidate, realPath, fingerprint: `${realPath}:${stat.size}:${Math.trunc(stat.mtimeMs)}` };
    } catch {
      // not here, or not executable: keep looking
    }
  }
};
