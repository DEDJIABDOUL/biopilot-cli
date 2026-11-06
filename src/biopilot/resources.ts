// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// BioPilot's files in the data directory (`~/.local/share/biopilot/`), next to the engine's resources:
// the Catalog, replaced by each release, and the User store, which nothing but BioPilot's own code touches.

import fs from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { CATALOG_FILE_NAME } from "./knowledge/location.js";

export { CATALOG_FILE_NAME, SQLITE_ADDON_FILE_NAME } from "./knowledge/location.js";

export const USER_STORE_FILE_NAME = "user.db";

/** Name of the Catalog among the standalone binary's assets. */
export const CATALOG_ASSET_KEY = CATALOG_FILE_NAME;

/**
 * Writes the Catalog into the data directory, replacing any previous one (spec decision 33). The new file
 * is renamed over the old one, so a session reading the old Catalog keeps a consistent file.
 */
export const installCatalog = async (dataDir: string, content: Uint8Array): Promise<void> => {
  await fsAsync.mkdir(dataDir, { recursive: true });
  const target = path.join(dataDir, CATALOG_FILE_NAME);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fsAsync.writeFile(temporary, content);
    await fsAsync.rename(temporary, target);
  } finally {
    await fsAsync.rm(temporary, { force: true });
  }
};

/** Removes the Catalog from the data directory; the User store next to it is left alone. */
export const removeCatalog = (dataDir: string): void => {
  fs.rmSync(path.join(dataDir, CATALOG_FILE_NAME), { force: true });
};

/** Moves the User store (with SQLite's journal files, if any) to another data directory, unless one is already there. */
export const moveUserStore = (fromDir: string, toDir: string): void => {
  if (!fs.existsSync(path.join(fromDir, USER_STORE_FILE_NAME)) || fs.existsSync(path.join(toDir, USER_STORE_FILE_NAME))) return;
  fs.mkdirSync(toDir, { recursive: true });
  for (const suffix of ["-wal", "-shm", "-journal", ""]) {
    const source = path.join(fromDir, USER_STORE_FILE_NAME + suffix);
    if (!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.join(toDir, USER_STORE_FILE_NAME + suffix));
    fs.rmSync(source);
  }
};
