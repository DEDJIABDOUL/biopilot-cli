// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

/**
 * Catalog schema version. The reader accepts a Catalog only when its stored
 * version equals this one exactly (spec decision 30): Catalog and reader always
 * ship together, so a mismatch means a broken install.
 */
export const CATALOG_SCHEMA_VERSION = 4;

export const PLATFORMS = ["illumina", "nanopore"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** What a project sets out to measure (spec decision 6). */
export const ASSAYS = ["rna-seq", "variant-calling", "unknown"] as const;
export type Assay = (typeof ASSAYS)[number];

/** Value types. An option without a value is a flag. Only `enum` restricts the value to its listed values. */
export const VALUE_TYPES = ["int", "float", "string", "file", "dir", "enum"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

/** How a file format is recognised: one file by its name, a reference index by prefix + suffixes, or by a folder + marker. */
export const FORMAT_KINDS = ["file", "prefix", "dir"] as const;
export type FormatKind = (typeof FORMAT_KINDS)[number];

export const CATALOG_DDL = `
-- Small pages: every table and index takes at least one page, so the fixed cost of a Catalog stays low
-- (spec §11 size budget, scaled down to a handful of tools). Lookup time is the same as with 4 KiB pages.
PRAGMA page_size = 1024;

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

CREATE TABLE formats (
  ord         INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL,
  description TEXT,
  pattern     TEXT,
  suffixes    TEXT,
  marker      TEXT
);

CREATE TABLE options (
  id             INTEGER PRIMARY KEY,
  command_id     INTEGER NOT NULL REFERENCES commands(id),
  canonical_name TEXT NOT NULL,
  description    TEXT,
  value_type     TEXT,
  value_format   TEXT,
  value_optional INTEGER NOT NULL,
  value_multiple INTEGER NOT NULL,
  read_role      INTEGER,
  mate_of        INTEGER REFERENCES options(id),
  derive_from    INTEGER REFERENCES options(id),
  derive_suffix  TEXT,
  default_value  TEXT,
  rank           INTEGER NOT NULL,
  since_version  TEXT,
  until_version  TEXT,
  repeatable     INTEGER NOT NULL,
  hidden         INTEGER NOT NULL,
  deprecated     INTEGER NOT NULL
);

CREATE TABLE option_values (
  option_id   INTEGER NOT NULL REFERENCES options(id),
  ord         INTEGER NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (option_id, ord)
) WITHOUT ROWID;

CREATE TABLE option_names (
  command_id INTEGER NOT NULL,
  name       TEXT NOT NULL,
  option_id  INTEGER NOT NULL REFERENCES options(id),
  ord        INTEGER NOT NULL,
  PRIMARY KEY (command_id, name)
) WITHOUT ROWID;

-- Full-text index over option names and descriptions; rowid = options.id.
CREATE VIRTUAL TABLE options_fts USING fts5(names, description, tokenize = 'unicode61');

CREATE TABLE rules (
  option_id INTEGER NOT NULL REFERENCES options(id),
  ord       INTEGER NOT NULL,
  paired    INTEGER,
  platform  TEXT,
  assay     TEXT,
  boost     INTEGER NOT NULL,
  PRIMARY KEY (option_id, ord)
) WITHOUT ROWID;

CREATE TABLE rule_used (
  option_id      INTEGER NOT NULL,
  rule_ord       INTEGER NOT NULL,
  ord            INTEGER NOT NULL,
  used_option_id INTEGER NOT NULL REFERENCES options(id),
  PRIMARY KEY (option_id, rule_ord, ord)
) WITHOUT ROWID;

CREATE TABLE arguments (
  command_id     INTEGER NOT NULL REFERENCES commands(id),
  position       INTEGER NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  variadic       INTEGER NOT NULL,
  value_type     TEXT,
  value_format   TEXT,
  value_optional INTEGER NOT NULL,
  value_multiple INTEGER NOT NULL,
  read_role      INTEGER,
  default_value  TEXT,
  since_version  TEXT,
  until_version  TEXT,
  PRIMARY KEY (command_id, position)
) WITHOUT ROWID;

CREATE TABLE argument_values (
  command_id  INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  ord         INTEGER NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (command_id, position, ord)
) WITHOUT ROWID;

-- Lookups of the reader that no primary key serves (spec §11: a query under 2 ms).
CREATE INDEX commands_by_parent ON commands (parent_id, name);
CREATE INDEX options_by_command ON options (command_id);
CREATE INDEX options_by_mate ON options (mate_of) WHERE mate_of IS NOT NULL;
CREATE INDEX option_names_by_option ON option_names (option_id, ord);
`;

/**
 * Canonical name of an option: its first long name, otherwise its first name
 * (spec decision 11). Aliases are case-sensitive.
 */
export const canonicalName = (names: readonly string[]): string => names.find((name) => name.startsWith("--")) ?? names[0];
