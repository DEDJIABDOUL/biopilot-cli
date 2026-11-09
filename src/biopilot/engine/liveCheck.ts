// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The live Warning of the status line (ticket #110): `biopilot check` on the line being typed, its last
// word left out while it is being typed. File checks are cached for a few seconds, so that a keystroke
// costs no new disk access for a word already seen. Never throws, never blocks Enter.

import fs from "node:fs";
import { checkLine, type CheckContext } from "../check/check.js";
import { availableCpus, type AvailableCpus } from "../check/cpus.js";
import { sessionEnvironment } from "../env/session.js";
import { getCatalog, projectAt } from "./catalogAccess.js";
import { installedOf } from "./catalogSpec.js";

const CACHE_MS = 3_000;
const CPUS_MS = 60_000;

type Cached<T> = { at: number; value: T };
const existsCache = new Map<string, Cached<boolean>>();
const dirCache = new Map<string, Cached<boolean>>();
const listCache = new Map<string, Cached<string[]>>();
const installedCache = new Map<string, Cached<ReturnType<typeof installedOf>>>();
let cpus: Cached<AvailableCpus> | undefined;

const cached = <T>(cache: Map<string, Cached<T>>, key: string, compute: () => T, now: number): T => {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = compute();
  if (cache.size > 2_000) cache.clear();
  cache.set(key, { at: now, value });
  return value;
};

const liveContext = (cwd: string, now: number): CheckContext => {
  const env = sessionEnvironment();
  if (!cpus || now - cpus.at >= CPUS_MS) cpus = { at: now, value: availableCpus({ ...process.env, ...env }) };
  return {
    cwd,
    home: process.env.HOME,
    exists: (file) => cached(existsCache, file, () => fs.existsSync(file), now),
    isDirectory: (file) =>
      cached(
        dirCache,
        file,
        () => {
          try {
            return fs.statSync(file).isDirectory();
          } catch {
            return false;
          }
        },
        now,
      ),
    list: (dir) =>
      cached(
        listCache,
        dir,
        () => {
          try {
            return fs.readdirSync(dir);
          } catch {
            return [];
          }
        },
        now,
      ),
    cpus: cpus.value,
    // The binary on the PATH and its Profiles: looked up again only every few seconds.
    // Keyed by the PATH too: `conda activate` switches binaries at once.
    installed: (tool) => cached(installedCache, `${tool}\0${env.PATH ?? ""}`, () => installedOf(tool), now),
  };
};

/** The words already typed: the last one is left out while the cursor is on it (`data/s` is no missing file). */
export const typedPart = (line: string): string => (/\s$/.test(line) ? line : line.replace(/\S+$/, ""));

/** The first Warning (not info) of the typed line, as one line of text; nothing when there is none or warnings are off. */
export const liveWarning = (line: string, cwd: string | undefined, now = Date.now()): string | undefined => {
  try {
    const catalog = getCatalog();
    if (!catalog || !cwd) return;
    if (projectAt(cwd)?.config?.warnings === false) return;
    const typed = typedPart(line);
    if (typed.trim() === "") return;
    const result = checkLine(typed, catalog, liveContext(cwd, now));
    if (!result.ok) return;
    return result.warnings.find((warning) => warning.severity === "warning")?.message;
  } catch {
    return;
  }
};
