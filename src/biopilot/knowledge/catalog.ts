// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Catalog reader: the stable interface over the Catalog file. Callers never see SQL.

import fs from "node:fs";
import Database from "better-sqlite3";
import { CATALOG_SCHEMA_VERSION, type Platform, type ValueType } from "./schema.js";
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

export type Option = {
  canonicalName: string;
  /** Every name of the option, in Catalog order (the canonical name included). Case-sensitive. */
  aliases: string[];
  description: string | null;
  /** `null` for a flag. */
  valueType: ValueType | null;
  defaultValue: string | null;
  rank: number;
};

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
  /** Options of a Command, highest rank first, ties in Catalog order. */
  listOptions(command: Command): Option[];
  /** Finds an Option of a Command by any of its aliases (case-sensitive). */
  findOption(command: Command, alias: string): Option | undefined;
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
type OptionRow = {
  id: number;
  canonical_name: string;
  description: string | null;
  value_type: ValueType | null;
  default_value: string | null;
  rank: number;
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

  constructor(
    readonly path: string,
    db: Database.Database,
    readonly schemaVersion: number,
    readonly builtBy: string,
  ) {
    this.#db = db;
    this.#statements = {
      listTools: db.prepare<[], ToolRow>("SELECT id, name, package, description, platforms FROM tools ORDER BY name"),
      getTool: db.prepare<[string], ToolRow>("SELECT id, name, package, description, platforms FROM tools WHERE name = ?"),
      rootCommand: db.prepare<[string], { id: number; description: string | null }>(
        "SELECT c.id, c.description FROM commands c JOIN tools t ON t.id = c.tool_id WHERE t.name = ? AND c.parent_id IS NULL",
      ),
      listOptions: db.prepare<[number], OptionRow>(
        "SELECT id, canonical_name, description, value_type, default_value, rank FROM options WHERE command_id = ? ORDER BY rank DESC, id",
      ),
      findOption: db.prepare<[number, string], OptionRow>(
        "SELECT o.id, o.canonical_name, o.description, o.value_type, o.default_value, o.rank FROM option_names n JOIN options o ON o.id = n.option_id WHERE n.command_id = ? AND n.name = ?",
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
    if (path.length > 0) return; // subcommands arrive with the Catalog format for them
    const row = this.#statements.rootCommand.get(tool);
    if (!row) return;
    this.#commandIds.set(this.#commandKey(tool, path), row.id);
    return { tool, path: [], description: row.description };
  }

  listOptions(command: Command): Option[] {
    const id = this.#commandId(command);
    return id === undefined ? [] : this.#statements.listOptions.all(id).map((row) => this.#toOption(row));
  }

  findOption(command: Command, alias: string): Option | undefined {
    const id = this.#commandId(command);
    if (id === undefined) return;
    const row = this.#statements.findOption.get(id, alias);
    return row ? this.#toOption(row) : undefined;
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
      valueType: row.value_type,
      defaultValue: row.default_value,
      rank: row.rank,
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
