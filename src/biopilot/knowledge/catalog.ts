// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Catalog reader: the stable interface over the Catalog file. Callers never see SQL.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CATALOG_SCHEMA_VERSION, type FormatKind, type Platform, type ValueType } from "./schema.js";
import { catalogCandidates } from "./location.js";

export type Tool = {
  name: string;
  package: string | null;
  description: string | null;
  /** Empty means generic. */
  platforms: Platform[];
};

export type Command = {
  tool: string;
  /** Subcommand path from the tool; empty for the root Command. */
  path: string[];
  description: string | null;
};

/** What an option or a positional argument takes. */
export type ValueSpec = {
  type: ValueType;
  /** Declared file format, for type file or dir. */
  format: string | null;
  /** The value may be omitted (`--opt[=VAL]`). */
  optional: boolean;
  /** Several values follow the option. */
  multiple: boolean;
  /** Suggested values, in Catalog order; the only allowed ones when the type is `enum`. */
  values: { value: string; description: string | null }[];
  /** Read 1 or read 2 of a read pair. */
  readRole: 1 | 2 | null;
};

export type Option = {
  canonicalName: string;
  /** Every name of the option, in Catalog order (the canonical name included). Case-sensitive. */
  aliases: string[];
  description: string | null;
  /** `null` for a flag. */
  value: ValueSpec | null;
  defaultValue: string | null;
  rank: number;
  /** First and last tool versions that have the option, when known. */
  since: string | null;
  until: string | null;
  repeatable: boolean;
  /** Known (for parsing a command line) but never suggested. */
  hidden: boolean;
  deprecated: boolean;
  /** Canonical name of the mate option of a read pair, in either direction. */
  mate: string | null;
  /** Derived output: canonical name of the source option and the suffix added to its value. */
  derive: { from: string; suffix: string } | null;
};

export type Argument = {
  /** Placeholder name, e.g. `in.bam`. */
  name: string;
  description: string | null;
  /** Takes one or more values. */
  variadic: boolean;
  value: ValueSpec | null;
  defaultValue: string | null;
  since: string | null;
  until: string | null;
};

export type Format = {
  name: string;
  kind: FormatKind;
  description: string | null;
  /** kind `file`: regular expression matched against the file name, case-insensitively. */
  pattern: string | null;
  /** kind `prefix`: suffixes that must all exist after the prefix. */
  suffixes: string[];
  /** kind `dir`: file that must exist inside the folder. */
  marker: string | null;
};

/** A path of a listing recognised as a format: a file, an index prefix, or an index folder. */
export type FileMatch = { path: string; format: string };

export interface Catalog {
  /** File the Catalog was read from. */
  readonly path: string;
  readonly schemaVersion: number;
  /** BioPilot version that compiled the Catalog. */
  readonly builtBy: string;
  listTools(): Tool[];
  getTool(name: string): Tool | undefined;
  /** Resolves a Command from a tool name and a subcommand path (empty path = root Command). */
  getCommand(tool: string, path?: readonly string[]): Command | undefined;
  /** Direct subcommands of a Command, in Catalog order. */
  listSubcommands(command: Command): Command[];
  /** Options of a Command, highest rank first, ties in Catalog order. */
  listOptions(command: Command): Option[];
  /** Positional arguments of a Command, in order. */
  listArguments(command: Command): Argument[];
  /** Finds an Option of a Command by any of its aliases (case-sensitive). */
  findOption(command: Command, alias: string): Option | undefined;
  /** Declared file formats, in declaration order. */
  listFormats(): Format[];
  /** Format of a single file, from its name (kind `file` only; first match in declaration order). */
  formatOfFile(fileName: string): Format | undefined;
  /**
   * Recognises formats in a directory listing (relative paths, `/`-separated): files by name, `prefix`
   * indexes by their complete set of suffixed files, `dir` indexes by their marker file.
   */
  matchFiles(paths: readonly string[]): FileMatch[];
  close(): void;
}

/** `engine-unavailable`: the SQLite engine itself could not be loaded (e.g. a missing native addon). */
export type CatalogUnavailableReason = "not-found" | "unreadable" | "incompatible-schema" | "engine-unavailable";

export type CatalogOpenResult =
  | { available: true; catalog: Catalog }
  | {
      available: false;
      reason: CatalogUnavailableReason;
      /** Human-readable explanation, naming the file(s) involved. */
      detail: string;
    };

type ToolRow = { id: number; name: string; package: string | null; description: string | null; platforms: string };
type ValueColumns = {
  value_type: ValueType | null;
  value_format: string | null;
  value_optional: number;
  value_multiple: number;
  read_role: 1 | 2 | null;
};

type OptionRow = ValueColumns & {
  id: number;
  canonical_name: string;
  description: string | null;
  default_value: string | null;
  rank: number;
  since_version: string | null;
  until_version: string | null;
  repeatable: number;
  hidden: number;
  deprecated: number;
  mate_name: string | null;
  derive_from_name: string | null;
  derive_suffix: string | null;
};

type ArgumentRow = ValueColumns & {
  command_id: number;
  position: number;
  name: string;
  description: string | null;
  variadic: number;
  default_value: string | null;
  since_version: string | null;
  until_version: string | null;
};

type FormatRow = { name: string; kind: FormatKind; description: string | null; pattern: string | null; suffixes: string | null; marker: string | null };
type ValueRow = { value: string; description: string | null };

/** Options with their mate (in either direction) and the name of the option they derive from. */
const OPTION_SELECT = `
  SELECT o.id, o.canonical_name, o.description, o.value_type, o.value_format, o.value_optional, o.value_multiple, o.read_role,
         o.default_value, o.rank, o.since_version, o.until_version, o.repeatable, o.hidden, o.deprecated, o.derive_suffix,
         COALESCE(m.canonical_name, (SELECT r.canonical_name FROM options r WHERE r.mate_of = o.id ORDER BY r.id LIMIT 1)) AS mate_name,
         d.canonical_name AS derive_from_name
  FROM options o
  LEFT JOIN options m ON m.id = o.mate_of
  LEFT JOIN options d ON d.id = o.derive_from`;

const toValueSpec = (row: ValueColumns, values: ValueRow[]): ValueSpec | null =>
  row.value_type === null
    ? null
    : {
        type: row.value_type,
        format: row.value_format,
        optional: row.value_optional === 1,
        multiple: row.value_multiple === 1,
        values: values.map(({ value, description }) => ({ value, description })),
        readRole: row.read_role,
      };

const toTool = (row: ToolRow): Tool => ({
  name: row.name,
  package: row.package,
  description: row.description,
  platforms: JSON.parse(row.platforms) as Platform[],
});

class SqliteCatalog implements Catalog {
  readonly #db: Database.Database;
  readonly #statements;
  /** Command id by `tool\0sub\0path` key; the reader resolves ids internally so callers never handle them. */
  readonly #commandIds = new Map<string, number>();
  /** Formats are few and used on every file suggestion: read once. */
  readonly #formats: Format[];
  /** File-kind patterns, compiled once. A pattern that does not compile matches nothing (never throws). */
  readonly #filePatterns: { format: Format; regex: RegExp }[];

  constructor(
    readonly path: string,
    db: Database.Database,
    readonly schemaVersion: number,
    readonly builtBy: string,
  ) {
    this.#db = db;
    this.#formats = db
      .prepare<[], FormatRow>("SELECT name, kind, description, pattern, suffixes, marker FROM formats ORDER BY ord")
      .all()
      .map((row) => ({ ...row, suffixes: row.suffixes ? (JSON.parse(row.suffixes) as string[]) : [] }));
    this.#filePatterns = this.#formats.flatMap((format) => {
      if (format.kind !== "file" || format.pattern === null) return [];
      try {
        return [{ format, regex: new RegExp(format.pattern, "i") }];
      } catch {
        return [];
      }
    });
    this.#statements = {
      listTools: db.prepare<[], ToolRow>("SELECT id, name, package, description, platforms FROM tools ORDER BY name"),
      getTool: db.prepare<[string], ToolRow>("SELECT id, name, package, description, platforms FROM tools WHERE name = ?"),
      rootCommand: db.prepare<[string], { id: number; description: string | null }>(
        "SELECT c.id, c.description FROM commands c JOIN tools t ON t.id = c.tool_id WHERE t.name = ? AND c.parent_id IS NULL",
      ),
      subcommand: db.prepare<[number, string], { id: number; description: string | null }>(
        "SELECT id, description FROM commands WHERE parent_id = ? AND name = ?",
      ),
      subcommands: db.prepare<[number], { id: number; name: string; description: string | null }>(
        "SELECT id, name, description FROM commands WHERE parent_id = ? ORDER BY id",
      ),
      listOptions: db.prepare<[number], OptionRow>(`${OPTION_SELECT} WHERE o.command_id = ? ORDER BY o.rank DESC, o.id`),
      findOption: db.prepare<[number, string], OptionRow>(
        `${OPTION_SELECT} WHERE o.id = (SELECT option_id FROM option_names WHERE command_id = ? AND name = ?)`,
      ),
      optionValues: db.prepare<[number], ValueRow>("SELECT value, description FROM option_values WHERE option_id = ? ORDER BY ord"),
      listArguments: db.prepare<[number], ArgumentRow>("SELECT * FROM arguments WHERE command_id = ? ORDER BY position"),
      argumentValues: db.prepare<[number, number], ValueRow>(
        "SELECT value, description FROM argument_values WHERE command_id = ? AND position = ? ORDER BY ord",
      ),
      optionNames: db.prepare<[number], { name: string }>("SELECT name FROM option_names WHERE option_id = ? ORDER BY ord"),
    };
  }

  listTools(): Tool[] {
    return this.#statements.listTools.all().map(toTool);
  }

  getTool(name: string): Tool | undefined {
    const row = this.#statements.getTool.get(name);
    return row ? toTool(row) : undefined;
  }

  getCommand(tool: string, path: readonly string[] = []): Command | undefined {
    let row = this.#statements.rootCommand.get(tool);
    for (const name of path) {
      if (!row) return;
      row = this.#statements.subcommand.get(row.id, name);
    }
    if (!row) return;
    this.#commandIds.set(this.#commandKey(tool, path), row.id);
    return { tool, path: [...path], description: row.description };
  }

  listSubcommands(command: Command): Command[] {
    const id = this.#commandId(command);
    if (id === undefined) return [];
    return this.#statements.subcommands.all(id).map((row) => {
      const path = [...command.path, row.name];
      this.#commandIds.set(this.#commandKey(command.tool, path), row.id);
      return { tool: command.tool, path, description: row.description };
    });
  }

  listOptions(command: Command): Option[] {
    const id = this.#commandId(command);
    return id === undefined ? [] : this.#statements.listOptions.all(id).map((row) => this.#toOption(row));
  }

  listArguments(command: Command): Argument[] {
    const id = this.#commandId(command);
    if (id === undefined) return [];
    return this.#statements.listArguments.all(id).map((row) => ({
      name: row.name,
      description: row.description,
      variadic: row.variadic === 1,
      value: toValueSpec(row, this.#statements.argumentValues.all(row.command_id, row.position)),
      defaultValue: row.default_value,
      since: row.since_version,
      until: row.until_version,
    }));
  }

  findOption(command: Command, alias: string): Option | undefined {
    const id = this.#commandId(command);
    if (id === undefined) return;
    const row = this.#statements.findOption.get(id, alias);
    return row ? this.#toOption(row) : undefined;
  }

  listFormats(): Format[] {
    return this.#formats.map((format) => ({ ...format, suffixes: [...format.suffixes] }));
  }

  formatOfFile(fileName: string): Format | undefined {
    const name = path.posix.basename(fileName.replaceAll("\\", "/"));
    return this.#filePatterns.find(({ regex }) => regex.test(name))?.format;
  }

  matchFiles(paths: readonly string[]): FileMatch[] {
    const present = new Set(paths);
    const matches: FileMatch[] = [];
    const seen = new Set<string>();
    const add = (match: FileMatch) => {
      const key = `${match.format}\0${match.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(match);
      }
    };
    for (const file of paths) {
      const fileFormat = this.formatOfFile(file);
      if (fileFormat) add({ path: file, format: fileFormat.name });
      for (const format of this.#formats) {
        if (format.kind === "prefix") {
          for (const suffix of format.suffixes.filter((s) => file.endsWith(s))) {
            const prefix = file.slice(0, -suffix.length);
            if (prefix && format.suffixes.every((s) => present.has(prefix + s))) add({ path: prefix, format: format.name });
          }
        } else if (format.kind === "dir" && format.marker !== null && path.posix.basename(file) === format.marker) {
          const folder = path.posix.dirname(file);
          if (folder !== ".") add({ path: folder, format: format.name });
        }
      }
    }
    return matches;
  }

  close(): void {
    this.#db.close();
  }

  #commandKey(tool: string, path: readonly string[]): string {
    return [tool, ...path].join("\0");
  }

  #commandId(command: Command): number | undefined {
    const key = this.#commandKey(command.tool, command.path);
    if (!this.#commandIds.has(key)) this.getCommand(command.tool, command.path);
    return this.#commandIds.get(key);
  }

  #toOption(row: OptionRow): Option {
    return {
      canonicalName: row.canonical_name,
      aliases: this.#statements.optionNames.all(row.id).map(({ name }) => name),
      description: row.description,
      value: toValueSpec(row, this.#statements.optionValues.all(row.id)),
      defaultValue: row.default_value,
      rank: row.rank,
      since: row.since_version,
      until: row.until_version,
      repeatable: row.repeatable === 1,
      hidden: row.hidden === 1,
      deprecated: row.deprecated === 1,
      mate: row.mate_name,
      derive: row.derive_from_name !== null && row.derive_suffix !== null ? { from: row.derive_from_name, suffix: row.derive_suffix } : null,
    };
  }
}

const openAt = (path: string): CatalogOpenResult => {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const meta = new Map(
      db
        .prepare<[], { key: string; value: string }>("SELECT key, value FROM metadata")
        .all()
        .map(({ key, value }) => [key, value]),
    );
    const schemaVersion = Number(meta.get("schema_version"));
    if (schemaVersion !== CATALOG_SCHEMA_VERSION) {
      db.close();
      return {
        available: false,
        reason: "incompatible-schema",
        detail: `${path} has schema version ${meta.get("schema_version") ?? "none"}, this BioPilot reads version ${CATALOG_SCHEMA_VERSION}`,
      };
    }
    return { available: true, catalog: new SqliteCatalog(path, db, schemaVersion, meta.get("biopilot_version") ?? "unknown") };
  } catch (error) {
    try {
      db?.close();
    } catch {
      // already unusable
    }
    const code = String((error as { code?: string }).code ?? (error as Error).message);
    if (!code.startsWith("SQLITE_")) {
      return { available: false, reason: "engine-unavailable", detail: `the SQLite engine could not be loaded (${code})` };
    }
    return { available: false, reason: "unreadable", detail: `${path} is unreadable or corrupt (${code})` };
  }
};

/**
 * Opens the Catalog. Never throws: a missing, corrupt or incompatible Catalog is reported as unavailable,
 * so callers can fall back to the engine's own behaviour (spec principle "fail silently").
 * @param path explicit file; when omitted, the standard locations are searched in order.
 */
export const openCatalog = (path?: string): CatalogOpenResult => {
  const candidates = path ? [path] : catalogCandidates();
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return { available: false, reason: "not-found", detail: `no Catalog at ${candidates.join(", ")}` };
  return openAt(found);
};
