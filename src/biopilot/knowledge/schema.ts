// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

/**
 * Catalog schema version. The reader accepts a Catalog only when its stored
 * version equals this one exactly (spec decision 30): Catalog and reader always
 * ship together, so a mismatch means a broken install.
 */
export const CATALOG_SCHEMA_VERSION = 2;

export const PLATFORMS = ["illumina", "nanopore"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Value types supported so far. `null` in the Catalog means a flag (no value). */
export const VALUE_TYPES = ["int", "float", "string"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const CATALOG_DDL = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE tools (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  package       TEXT,
  description   TEXT,
  platforms     TEXT NOT NULL,
  version_args  TEXT NOT NULL,
  version_regex TEXT NOT NULL,
  help_args     TEXT
);

CREATE TABLE commands (
  id          INTEGER PRIMARY KEY,
  tool_id     INTEGER NOT NULL REFERENCES tools(id),
  parent_id   INTEGER REFERENCES commands(id),
  name        TEXT NOT NULL,
  help_args   TEXT,
  description TEXT
);

CREATE TABLE options (
  id             INTEGER PRIMARY KEY,
  command_id     INTEGER NOT NULL REFERENCES commands(id),
  canonical_name TEXT NOT NULL,
  description    TEXT,
  value_type     TEXT,
  default_value  TEXT,
  rank           INTEGER NOT NULL
);

CREATE TABLE option_names (
  command_id INTEGER NOT NULL,
  name       TEXT NOT NULL,
  option_id  INTEGER NOT NULL REFERENCES options(id),
  ord        INTEGER NOT NULL,
  PRIMARY KEY (command_id, name)
) WITHOUT ROWID;

CREATE TABLE arguments (
  command_id  INTEGER NOT NULL REFERENCES commands(id),
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  variadic    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (command_id, position)
) WITHOUT ROWID;
`;

/**
 * Canonical name of an option: its first long name, otherwise its first name
 * (spec decision 11). Aliases are case-sensitive.
 */
export const canonicalName = (names: readonly string[]): string => names.find((name) => name.startsWith("--")) ?? names[0];
