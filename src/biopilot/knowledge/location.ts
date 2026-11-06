// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { allResourcesPath } from "../../utils/constants.js";

export const CATALOG_FILE_NAME = "knowledge.db";

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
