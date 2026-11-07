// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Opens SQLite files for the Catalog and the User store, from source and from the standalone binary alike.

import Database from "better-sqlite3";
import { sqliteAddonPath } from "./knowledge/location.js";

/** Loaded addons by file: an addon is loaded (and initialised by better-sqlite3) once per process. */
const loadedAddons = new Map<string, object>();

/**
 * Loads a native addon from its file. `process.dlopen`, not `require`: in the standalone binary `require`
 * only knows Node's builtin modules (better-sqlite3 would `require` a path given as a string).
 */
const loadAddon = (file: string): object => {
  let addon = loadedAddons.get(file);
  if (!addon) {
    const module = { exports: {} };
    process.dlopen(module, file);
    addon = module.exports;
    loadedAddons.set(file, addon);
  }
  return addon;
};

/**
 * Opens a SQLite file. `addonPath`: SQLite addon file to load; by default the one extracted by the
 * standalone binary, or better-sqlite3's own from source. Throws like better-sqlite3.
 */
export const openSqlite = (file: string, options: Database.Options, addonPath: string | undefined = sqliteAddonPath()): Database.Database => {
  const nativeBinding = addonPath === undefined ? undefined : loadAddon(addonPath);
  // better-sqlite3 13 takes the loaded addon object as `nativeBinding`; its types (9.x) only know a path.
  return new Database(file, { ...options, ...(nativeBinding && { nativeBinding }) } as Database.Options);
};
