// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The User store (`user.db`, spec §6.3): what BioPilot learned on this machine. Phase 3 keeps Profiles and
// the versions probed per Fingerprint. Never throws: an unavailable store means "nothing known".

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { allResourcesPath } from "../../utils/constants.js";
import { USER_STORE_FILE_NAME } from "../resources.js";
import { openSqlite } from "../sqlite.js";
import type { HelpOption } from "./helpParser.js";

/** Environment variable that, when set, is the User store file (tests, development). */
export const USER_STORE_ENV = "BIOPILOT_USER_STORE";

export const userStorePath = (env: NodeJS.ProcessEnv = process.env): string => env[USER_STORE_ENV] || path.join(allResourcesPath, USER_STORE_FILE_NAME);

/** The options a given version of a Command offers, read from its --help. `command`: the subcommand path joined by spaces, `""` for the root. */
export type Profile = { tool: string; version: string; command: string; options: HelpOption[]; fingerprint: string; createdAt: number };

/** Key of a Profile when the version is unknown: the binary's Fingerprint stands for it. */
export const versionKey = (version: string | undefined, fingerprint: string): string => version ?? `fp:${fingerprint}`;

const DDL = `
CREATE TABLE IF NOT EXISTS profiles (
  tool        TEXT NOT NULL,
  version     TEXT NOT NULL,
  command     TEXT NOT NULL,
  options     TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (tool, version, command)
);
CREATE TABLE IF NOT EXISTS binaries (
  fingerprint TEXT PRIMARY KEY,
  tool        TEXT NOT NULL,
  version     TEXT
);`;

export interface UserStore {
  getProfile(tool: string, version: string, command: string): Profile | undefined;
  putProfile(profile: Profile): void;
  /** The version probed for a binary (`null`: probed, none found); `undefined` when never probed. */
  probedVersion(fingerprint: string): string | null | undefined;
  putProbedVersion(fingerprint: string, tool: string, version: string | null): void;
  close(): void;
}

class SqliteUserStore implements UserStore {
  readonly #db: Database.Database;
  readonly #statements;

  constructor(db: Database.Database) {
    this.#db = db;
    this.#statements = {
      getProfile: db.prepare<[string, string, string], { options: string; fingerprint: string; created_at: number }>(
        "SELECT options, fingerprint, created_at FROM profiles WHERE tool = ? AND version = ? AND command = ?",
      ),
      putProfile: db.prepare("INSERT OR REPLACE INTO profiles (tool, version, command, options, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
      probedVersion: db.prepare<[string], { version: string | null }>("SELECT version FROM binaries WHERE fingerprint = ?"),
      putProbedVersion: db.prepare("INSERT OR REPLACE INTO binaries (fingerprint, tool, version) VALUES (?, ?, ?)"),
    };
  }

  getProfile(tool: string, version: string, command: string): Profile | undefined {
    try {
      const row = this.#statements.getProfile.get(tool, version, command);
      return row
        ? { tool, version, command, options: JSON.parse(row.options) as HelpOption[], fingerprint: row.fingerprint, createdAt: row.created_at }
        : undefined;
    } catch {
      return;
    }
  }

  putProfile(profile: Profile): void {
    this.#statements.putProfile.run(profile.tool, profile.version, profile.command, JSON.stringify(profile.options), profile.fingerprint, profile.createdAt);
  }

  probedVersion(fingerprint: string): string | null | undefined {
    try {
      return this.#statements.probedVersion.get(fingerprint)?.version;
    } catch {
      return;
    }
  }

  putProbedVersion(fingerprint: string, tool: string, version: string | null): void {
    this.#statements.putProbedVersion.run(fingerprint, tool, version);
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Opens the User store. `create`: make it (0600, in a 0700 folder) when missing; otherwise a missing store
 * is simply unavailable. Never throws.
 */
export const openUserStore = ({ create, file = userStorePath() }: { create: boolean; file?: string }): UserStore | undefined => {
  try {
    if (!create && !fs.existsSync(file)) return;
    if (create) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const existed = fs.existsSync(file);
    const db = openSqlite(file, { fileMustExist: !create });
    if (!existed) fs.chmodSync(file, 0o600);
    db.pragma("busy_timeout = 1000");
    if (create) db.exec(DDL);
    return new SqliteUserStore(db);
  } catch {
    return;
  }
};
