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
import type { ToolQuery } from "../knowledge/catalog.js";
import type { HelpOption } from "./helpParser.js";

/**
 * A Learned tool (spec §6.3): how to query a tool absent from the Catalog, as the Catalog says it for its own
 * Tools; its options come from its Profiles.
 */
export type LearnedTool = {
  name: string;
  description: string | null;
  query: ToolQuery;
  subcommands: { name: string; description: string | null }[];
  learnedAt: number;
};

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
);
CREATE TABLE IF NOT EXISTS learned_tools (
  name        TEXT PRIMARY KEY,
  definition  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  tool        TEXT NOT NULL,
  command     TEXT NOT NULL,
  option_name TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  last_used   INTEGER NOT NULL,
  PRIMARY KEY (tool, command, option_name)
);`;

export interface UserStore {
  getProfile(tool: string, version: string, command: string): Profile | undefined;
  putProfile(profile: Profile): void;
  /** The version probed for a binary (`null`: probed, none found); `undefined` when never probed. */
  probedVersion(fingerprint: string): string | null | undefined;
  putProbedVersion(fingerprint: string, tool: string, version: string | null): void;
  /** How often each option (canonical name) of a command was accepted. */
  usageCounts(tool: string, command: string): Map<string, number>;
  addUsage(tool: string, command: string, optionName: string, now?: number): void;
  resetUsage(): void;
  /** Every Profile stored for a tool, most recent first. */
  listProfiles(tool: string): Profile[];
  getLearnedTool(name: string): LearnedTool | undefined;
  listLearnedTools(): LearnedTool[];
  putLearnedTool(tool: LearnedTool): void;
  /** Forgets a learned tool and its Profiles; whether it was learned. */
  forgetLearnedTool(name: string): boolean;
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
      usageCounts: db.prepare<[string, string], { option_name: string; count: number }>("SELECT option_name, count FROM usage WHERE tool = ? AND command = ?"),
      addUsage: db.prepare(
        "INSERT INTO usage (tool, command, option_name, count, last_used) VALUES (?, ?, ?, 1, ?) ON CONFLICT (tool, command, option_name) DO UPDATE SET count = count + 1, last_used = excluded.last_used",
      ),
      resetUsage: db.prepare("DELETE FROM usage"),
      listProfiles: db.prepare<[string], { version: string; command: string; options: string; fingerprint: string; created_at: number }>(
        "SELECT version, command, options, fingerprint, created_at FROM profiles WHERE tool = ? ORDER BY created_at DESC",
      ),
      getLearned: db.prepare<[string], { definition: string }>("SELECT definition FROM learned_tools WHERE name = ?"),
      listLearned: db.prepare<[], { definition: string }>("SELECT definition FROM learned_tools ORDER BY name"),
      putLearned: db.prepare("INSERT OR REPLACE INTO learned_tools (name, definition) VALUES (?, ?)"),
      forgetLearned: db.prepare("DELETE FROM learned_tools WHERE name = ?"),
      forgetProfiles: db.prepare("DELETE FROM profiles WHERE tool = ?"),
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

  usageCounts(tool: string, command: string): Map<string, number> {
    try {
      return new Map(this.#statements.usageCounts.all(tool, command).map((row) => [row.option_name, row.count]));
    } catch {
      return new Map();
    }
  }

  addUsage(tool: string, command: string, optionName: string, now = Date.now()): void {
    this.#statements.addUsage.run(tool, command, optionName, now);
  }

  resetUsage(): void {
    this.#statements.resetUsage.run();
  }

  listProfiles(tool: string): Profile[] {
    try {
      return this.#statements.listProfiles.all(tool).map((row) => ({
        tool,
        version: row.version,
        command: row.command,
        options: JSON.parse(row.options) as HelpOption[],
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  getLearnedTool(name: string): LearnedTool | undefined {
    try {
      const row = this.#statements.getLearned.get(name);
      return row ? (JSON.parse(row.definition) as LearnedTool) : undefined;
    } catch {
      return;
    }
  }

  listLearnedTools(): LearnedTool[] {
    try {
      return this.#statements.listLearned.all().map((row) => JSON.parse(row.definition) as LearnedTool);
    } catch {
      return [];
    }
  }

  putLearnedTool(tool: LearnedTool): void {
    this.#statements.putLearned.run(tool.name, JSON.stringify(tool));
  }

  forgetLearnedTool(name: string): boolean {
    // A Catalog Tool's Profiles are its own: only a learned tool's go with it.
    const forgotten = this.#statements.forgetLearned.run(name).changes > 0;
    if (forgotten) this.#statements.forgetProfiles.run(name);
    return forgotten;
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Opens the User store. `create`: make it (0600) when missing; otherwise a missing store is simply
 * unavailable. `createFolder`: also make its folder (0700) when missing. Never throws.
 */
export const openUserStore = ({
  create,
  createFolder = create,
  file = userStorePath(),
}: {
  create: boolean;
  createFolder?: boolean;
  file?: string;
}): UserStore | undefined => {
  try {
    if (!create && !fs.existsSync(file)) return;
    if (createFolder) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const existed = fs.existsSync(file);
    const db = openSqlite(file, { fileMustExist: !create });
    if (!existed) fs.chmodSync(file, 0o600);
    db.pragma("busy_timeout = 1000");
    // Every table, also in a store made by an earlier BioPilot (no `usage` before phase 4). A store that
    // cannot be written (read-only folder) is still read.
    try {
      db.exec(DDL);
    } catch {
      if (create) throw new Error("the User store cannot be written");
    }
    return new SqliteUserStore(db);
  } catch {
    return;
  }
};
