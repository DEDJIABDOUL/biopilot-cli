// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import path from "node:path";
import sea from "node:sea";
import { fileURLToPath } from "node:url";
import { allResourcesPath, nativeResourcesPath } from "../../utils/constants.js";

export const CATALOG_FILE_NAME = "knowledge.db";

/** File name of better-sqlite3's native addon among the native resources of the standalone binary. */
export const SQLITE_ADDON_FILE_NAME = "better_sqlite3.node";

/** Environment variable that, when set, is the only place the Catalog is looked up (tests, development). */
export const CATALOG_ENV = "BIOPILOT_CATALOG";

/** The Catalog compiled next to the build (`build/knowledge.db`), when running from a source checkout. */
const buildCatalogPath = (): string | undefined => {
  try {
    const url = import.meta.url;
    if (typeof url !== "string" || !url.startsWith("file:")) return; // e.g. the standalone binary bundle
    return path.resolve(path.dirname(fileURLToPath(url)), "..", "..", CATALOG_FILE_NAME);
  } catch {
    return;
  }
};

/**
 * Where to look for the Catalog, in order (spec decision 22):
 * `BIOPILOT_CATALOG` alone when set; otherwise BioPilot's data directory, then the build output.
 */
export const catalogCandidates = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const fromEnv = env[CATALOG_ENV];
  if (fromEnv) return [path.resolve(fromEnv)];
  const candidates = [path.join(allResourcesPath, CATALOG_FILE_NAME)];
  const fromBuild = buildCatalogPath();
  if (fromBuild) candidates.push(fromBuild);
  return candidates;
};

/**
 * The SQLite addon to load: in the standalone binary, the one extracted with the other native resources
 * (ADR-0001); from source, none (better-sqlite3 finds its own in node_modules).
 */
export const sqliteAddonPath = (): string | undefined => (sea.isSea() ? path.join(nativeResourcesPath, SQLITE_ADDON_FILE_NAME) : undefined);
