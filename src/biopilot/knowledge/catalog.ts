// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Catalog reader: the stable interface over the Catalog file. Callers never see SQL.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CATALOG_SCHEMA_VERSION, type Assay, type FormatKind, type Platform, type ValueType } from "./schema.js";
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

/** A context condition; `null` (or an empty `used`) means "no constraint". See `ruleHolds`. */
export type RuleCondition = {
  /** Canonical names of options of the same command that must already be on the command line. */
  used: string[];
  paired: boolean | null;
  /** Holds when the project's platforms contain this one. */
  platform: Platform | null;
  assay: Assay | null;
};

/** Adds `boost` (−100 to +100) to an option's rank when `when` holds. */
export type Rule = { when: RuleCondition; boost: number };

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
  /** Context rules, in Catalog order. */
  rules: Rule[];
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

/** An option found by `searchOptions`, with the command it belongs to. */
export type SearchResult = { command: Command; option: Option };

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
  /**
   * Searches options of every tool by the words of their names and descriptions: every word must match,
   * the last one as a prefix. Best matches first. Any text is accepted; nothing to search finds nothing.
   */
  searchOptions(text: string, limit?: number): SearchResult[];
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
type RuleRow = { option_id: number; ord: number; paired: number | null; platform: Platform | null; assay: Assay | null; boost: number };

/** An option's aliases, values and rules, fetched one option at a time or for a whole command at once. */
type OptionDetails = {
  names: (optionId: number) => string[];
  values: (optionId: number) => ValueRow[];
  rules: (optionId: number) => Rule[];
};

const groupBy = <T>(rows: T[], key: (row: T) => number | string): Map<number | string, T[]> => {
  const groups = new Map<number | string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
};

const toRule = (rule: RuleRow, used: string[]): Rule => ({
  when: { used, paired: rule.paired === null ? null : rule.paired === 1, platform: rule.platform, assay: rule.assay },
  boost: rule.boost,
});

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
      optionRules: db.prepare<[number], { ord: number; paired: number | null; platform: Platform | null; assay: Assay | null; boost: number }>(
        "SELECT ord, paired, platform, assay, boost FROM rules WHERE option_id = ? ORDER BY ord",
      ),
      ruleUsed: db.prepare<[number, number], { name: string }>(
        "SELECT o.canonical_name AS name FROM rule_used u JOIN options o ON o.id = u.used_option_id WHERE u.option_id = ? AND u.rule_ord = ? ORDER BY u.ord",
      ),
      search: db.prepare<[string, number], { id: number; command_id: number }>(
        "SELECT f.rowid AS id, o.command_id FROM options_fts f JOIN options o ON o.id = f.rowid WHERE options_fts MATCH ? ORDER BY bm25(options_fts), o.id LIMIT ?",
      ),
      optionById: db.prepare<[number], OptionRow>(`${OPTION_SELECT} WHERE o.id = ?`),
      commandById: db.prepare<[number], { parent_id: number | null; name: string; description: string | null; tool: string }>(
        "SELECT c.parent_id, c.name, c.description, t.name AS tool FROM commands c JOIN tools t ON t.id = c.tool_id WHERE c.id = ?",
      ),
      // Whole-command variants, so listing a large command costs a fixed number of queries.
      commandNames: db.prepare<[number], { option_id: number; name: string }>(
        "SELECT option_id, name FROM option_names WHERE command_id = ? ORDER BY option_id, ord",
      ),
      commandValues: db.prepare<[number], ValueRow & { option_id: number }>(
        "SELECT v.option_id, v.value, v.description FROM option_values v JOIN options o ON o.id = v.option_id WHERE o.command_id = ? ORDER BY v.option_id, v.ord",
      ),
      commandRules: db.prepare<[number], RuleRow>(
        "SELECT r.option_id, r.ord, r.paired, r.platform, r.assay, r.boost FROM rules r JOIN options o ON o.id = r.option_id WHERE o.command_id = ? ORDER BY r.option_id, r.ord",
      ),
      commandRuleUsed: db.prepare<[number], { option_id: number; rule_ord: number; name: string }>(
        `SELECT u.option_id, u.rule_ord, m.canonical_name AS name FROM rule_used u
         JOIN options o ON o.id = u.option_id JOIN options m ON m.id = u.used_option_id
         WHERE o.command_id = ? ORDER BY u.option_id, u.rule_ord, u.ord`,
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
    if (id === undefined) return [];
    const details = this.#commandDetails(id);
    return this.#statements.listOptions.all(id).map((row) => this.#toOption(row, details));
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

  searchOptions(text: string, limit = 20): SearchResult[] {
    // Words only (the index tokenises names and descriptions the same way), each quoted so that no
    // character of the user's text can be read as FTS5 query syntax.
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length === 0) return [];
    const query = words.map((word, i) => `"${word}"${i === words.length - 1 ? "*" : ""}`).join(" ");
    // A result whose option or command is missing (damaged Catalog) is skipped, never thrown.
    return this.#statements.search.all(query, limit).flatMap((row) => {
      const command = this.#commandFromId(row.command_id);
      const option = this.#statements.optionById.get(row.id);
      return command && option ? [{ command, option: this.#toOption(option) }] : [];
    });
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

  /** Rebuilds a Command from its id by walking up to the root; nothing if a command on the way is missing. */
  #commandFromId(id: number): Command | undefined {
    const path: string[] = [];
    let row = this.#statements.commandById.get(id);
    if (!row) return;
    const { tool, description } = row;
    while (row.parent_id !== null) {
      path.unshift(row.name);
      row = this.#statements.commandById.get(row.parent_id);
      if (!row) return;
    }
    this.#commandIds.set(this.#commandKey(tool, path), id);
    return { tool, path, description };
  }

  #commandKey(tool: string, path: readonly string[]): string {
    return [tool, ...path].join("\0");
  }

  #commandId(command: Command): number | undefined {
    const key = this.#commandKey(command.tool, command.path);
    if (!this.#commandIds.has(key)) this.getCommand(command.tool, command.path);
    return this.#commandIds.get(key);
  }

  /** Details of one option, a few small queries. */
  readonly #singleDetails: OptionDetails = {
    names: (optionId) => this.#statements.optionNames.all(optionId).map(({ name }) => name),
    values: (optionId) => this.#statements.optionValues.all(optionId),
    rules: (optionId) =>
      this.#statements.optionRules.all(optionId).map((rule) =>
        toRule(
          { ...rule, option_id: optionId },
          this.#statements.ruleUsed.all(optionId, rule.ord).map(({ name }) => name),
        ),
      ),
  };

  /** Details of every option of a command, in four queries. */
  #commandDetails(commandId: number): OptionDetails {
    const names = groupBy(this.#statements.commandNames.all(commandId), (row) => row.option_id);
    const values = groupBy(this.#statements.commandValues.all(commandId), (row) => row.option_id);
    const used = groupBy(this.#statements.commandRuleUsed.all(commandId), (row) => `${row.option_id}:${row.rule_ord}`);
    const rules = groupBy(this.#statements.commandRules.all(commandId), (row) => row.option_id);
    return {
      names: (optionId) => (names.get(optionId) ?? []).map(({ name }) => name),
      values: (optionId) => values.get(optionId) ?? [],
      rules: (optionId) =>
        (rules.get(optionId) ?? []).map((rule) =>
          toRule(
            rule,
            (used.get(`${optionId}:${rule.ord}`) ?? []).map(({ name }) => name),
          ),
        ),
    };
  }

  #toOption(row: OptionRow, details: OptionDetails = this.#singleDetails): Option {
    return {
      canonicalName: row.canonical_name,
      aliases: details.names(row.id),
      description: row.description,
      value: toValueSpec(row, details.values(row.id)),
      defaultValue: row.default_value,
      rank: row.rank,
      since: row.since_version,
      until: row.until_version,
      repeatable: row.repeatable === 1,
      hidden: row.hidden === 1,
      deprecated: row.deprecated === 1,
      mate: row.mate_name,
      derive: row.derive_from_name !== null && row.derive_suffix !== null ? { from: row.derive_from_name, suffix: row.derive_suffix } : null,
      rules: details.rules(row.id),
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
