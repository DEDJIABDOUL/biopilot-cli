// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Build-time only: compiles the tool YAML sources and the shared formats file into the Catalog.
// Never imported by the runtime (the YAML parser is a dev dependency).

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CATALOG_DDL, CATALOG_SCHEMA_VERSION, canonicalName, type Assay, type FormatKind, type Platform, type ValueType } from "./schema.js";
import { SCHEMAS_DIR, captureGroups, formatLocation, loadYaml, schemaValidator, type CompileError, type Segment } from "./yamlSource.js";

export type { CompileError } from "./yamlSource.js";

export type CompileResult = { ok: true; toolCount: number } | { ok: false; errors: CompileError[] };

export type CompileOptions = {
  /** Folder holding one `<tool>.yml` (or `.yaml`) file per Tool. */
  sourcesDir: string;
  /** Shared formats file (`knowledge/formats.yml`). Without it, no format is declared. */
  formatsPath?: string;
  /** Path of the Catalog file to write. Replaced atomically on success, untouched on failure. */
  outputPath: string;
  /** BioPilot version recorded in the Catalog metadata. */
  biopilotVersion: string;
};

/** The published tool schema. */
export const TOOL_SCHEMA_PATH = path.join(SCHEMAS_DIR, "tool.schema.json");

const validateTool = schemaValidator("tool.schema.json");
const validateFormats = schemaValidator("formats.schema.json");

// ---------------------------------------------------------------------------------------------
// YAML shapes (as validated by the schemas)

type YamlValue = {
  type: ValueType;
  format?: string | string[];
  optional?: boolean;
  multiple?: boolean;
  values?: (string | { value: string; description?: string })[];
  read_role?: 1 | 2;
  mate_of?: string;
  derive?: { from: string; suffix: string };
};

type YamlOption = {
  names: string[];
  description?: string;
  value?: YamlValue;
  default?: string | number | boolean;
  rank?: number;
  since?: string;
  until?: string;
  repeatable?: boolean;
  hidden?: boolean;
  deprecated?: boolean;
  rules?: YamlRule[];
};

type YamlRule = { when: { used?: string[]; paired?: boolean; platform?: Platform; assay?: Assay }; boost: number };

type YamlArgument = {
  name: string;
  description?: string;
  variadic?: boolean;
  /** `mate_of` here names another argument; `derive` doesn't apply. */
  value?: YamlValue;
  default?: string | number | boolean;
  since?: string;
  until?: string;
};

type YamlCommand = {
  name: string;
  description?: string;
  help?: string[];
  options?: YamlOption[];
  arguments?: YamlArgument[];
  commands?: YamlCommand[];
};

type YamlTool = YamlCommand & {
  package?: string;
  platforms?: Platform[];
  version: { args: string[]; regex: string };
};

type YamlFormat = { name: string; description?: string; kind?: FormatKind; pattern?: string; suffixes?: string[]; marker?: string | string[] };

// ---------------------------------------------------------------------------------------------
// Normalised sources, ready to write

type ValueSource = {
  type: ValueType;
  /** Accepted formats, most common first. */
  formats: string[];
  optional: boolean;
  multiple: boolean;
  values: { value: string; description?: string }[];
  readRole?: 1 | 2;
};

type OptionSource = {
  names: string[];
  description?: string;
  value: ValueSource | null;
  defaultValue?: string;
  rank: number;
  since?: string;
  until?: string;
  repeatable: boolean;
  hidden: boolean;
  deprecated: boolean;
  /** Alias of the mate option, in the same command. */
  mateOf?: string;
  /** Derived output: alias of the source option and suffix added to its value. */
  derive?: { from: string; suffix: string };
  rules: YamlRule[];
};

type ArgumentSource = {
  name: string;
  description?: string;
  variadic: boolean;
  value: ValueSource | null;
  defaultValue?: string;
  since?: string;
  until?: string;
  /** Name of the mate argument, in the same command. */
  mateOf?: string;
};

type CommandSource = {
  /** `""` for the root command. */
  name: string;
  description?: string;
  helpArgs?: string[];
  options: OptionSource[];
  arguments: ArgumentSource[];
  commands: CommandSource[];
};

type ToolSource = {
  file: string;
  name: string;
  package?: string;
  description?: string;
  platforms: Platform[];
  versionArgs: string[];
  versionRegex: string;
  root: CommandSource;
};

type FormatSource = Omit<YamlFormat, "marker"> & { kind: FormatKind; markers: string[] };

/** A single string or a list, as a list. */
const asList = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const scalar = (value: string | number | boolean | undefined) => (value === undefined ? undefined : String(value));

const toValueSource = (value: YamlValue | undefined): ValueSource | null =>
  value
    ? {
        type: value.type,
        formats: asList(value.format),
        optional: value.optional ?? false,
        multiple: value.multiple ?? false,
        values: (value.values ?? []).map((item) => (typeof item === "string" ? { value: item } : item)),
        readRole: value.read_role,
      }
    : null;

const toCommandSource = (command: YamlCommand): CommandSource => ({
  name: command.name,
  description: command.description,
  helpArgs: command.help,
  options: (command.options ?? []).map((option) => ({
    names: option.names,
    description: option.description,
    value: toValueSource(option.value),
    defaultValue: scalar(option.default),
    rank: option.rank ?? 50,
    since: option.since,
    until: option.until,
    repeatable: option.repeatable ?? false,
    hidden: option.hidden ?? false,
    deprecated: option.deprecated ?? false,
    mateOf: option.value?.mate_of,
    derive: option.value?.derive,
    rules: option.rules ?? [],
  })),
  arguments: (command.arguments ?? []).map((argument) => ({
    name: argument.name,
    description: argument.description,
    variadic: argument.variadic ?? false,
    value: toValueSource(argument.value),
    defaultValue: scalar(argument.default),
    since: argument.since,
    until: argument.until,
    mateOf: argument.value?.mate_of,
  })),
  commands: (command.commands ?? []).map(toCommandSource),
});

const toToolSource = (file: string, tool: YamlTool): ToolSource => ({
  file,
  name: tool.name,
  package: tool.package,
  description: tool.description,
  platforms: tool.platforms ?? [],
  versionArgs: tool.version.args,
  versionRegex: tool.version.regex,
  // The tool's own description stays on the tool; the root command has none of its own.
  root: toCommandSource({ ...tool, name: "", description: undefined }),
});

// ---------------------------------------------------------------------------------------------
// Reading and checking

/** Reads the shared formats file. Returns the formats by name, or nothing if the file is invalid. */
const readFormats = (formatsPath: string | undefined, errors: CompileError[]): FormatSource[] | undefined => {
  if (!formatsPath) return [];
  if (!fs.existsSync(formatsPath)) {
    errors.push({ file: formatsPath, location: "document", message: "formats file not found" });
    return;
  }
  const before = errors.length;
  const loaded = loadYaml(formatsPath, formatsPath, validateFormats, errors);
  if (!loaded) return;
  const formats = ((loaded.data as { formats?: unknown })?.formats ?? []) as unknown[];
  const seen = new Map<string, number>();
  formats.forEach((item, i) => {
    const format = item as Partial<YamlFormat> | null;
    if (typeof format?.name === "string") {
      const previous = seen.get(format.name);
      if (previous !== undefined) loaded.fail(["formats", i, "name"], `format "${format.name}" is already declared at formats[${previous}]`);
      else seen.set(format.name, i);
    }
    if (typeof format?.pattern === "string") {
      try {
        new RegExp(format.pattern, "i");
      } catch (error) {
        loaded.fail(["formats", i, "pattern"], `is not a valid regular expression: ${(error as Error).message}`);
      }
    }
  });
  if (errors.length > before) return;
  return (formats as YamlFormat[]).map(({ marker, ...format }) => ({ ...format, kind: format.kind ?? "file", markers: asList(marker) }));
};

/** Reads and checks one tool YAML file, appending every problem found to `errors`. */
const readToolSource = (sourcesDir: string, file: string, formats: Map<string, FormatKind>, errors: CompileError[]): ToolSource | undefined => {
  const before = errors.length;
  const loaded = loadYaml(path.join(sourcesDir, file), file, validateTool, errors);
  if (!loaded) return;
  const { data, fail } = loaded;

  // Semantic checks. They run even when the schema failed, on whatever parts are well-formed,
  // so a contributor sees every problem of the file at once.
  const regex = (data as { version?: { regex?: unknown } })?.version?.regex;
  if (typeof regex === "string" && regex.length > 0) {
    try {
      const groups = captureGroups(new RegExp(regex));
      if (groups !== 1) fail(["version", "regex"], `must have exactly one capture group (the version number), found ${groups}`);
    } catch (error) {
      fail(["version", "regex"], `is not a valid regular expression: ${(error as Error).message}`);
    }
  }

  /** Checks a value's type, format and enum values. */
  const checkValue = (value: Partial<YamlValue> | undefined, at: Segment[]) => {
    if (typeof value !== "object" || value === null) return;
    const listed = Array.isArray(value.format);
    (listed ? (value.format as unknown[]) : [value.format]).forEach((name, i) => {
      if (typeof name !== "string") return;
      const where = listed ? [...at, "format", i] : [...at, "format"];
      const kind = formats.get(name);
      if (!kind) fail(where, `format "${name}" is not declared in the formats file`);
      else if (value.type !== "file" && value.type !== "dir") fail(where, `a format only applies to type file or dir, not ${value.type}`);
      else if (value.type === "dir" && kind !== "dir") fail(where, `format "${name}" is a ${kind}, not a folder: use type file`);
      else if (value.type === "file" && kind === "dir") fail(where, `format "${name}" is a folder: use type dir`);
    });
    if (value.type === "enum" && !(Array.isArray(value.values) && value.values.length > 0)) fail([...at, "values"], "an enum needs at least one value");
    if (value.read_role !== undefined && value.type !== "file") fail([...at, "read_role"], "a read role only applies to type file");
  };

  /** Per-command checks, recursively. */
  const checkCommand = (node: unknown, at: Segment[]) => {
    const command = node as { options?: unknown; commands?: unknown; arguments?: unknown } | null;
    if (typeof command !== "object" || command === null) return;
    const options = (Array.isArray(command.options) ? command.options : []) as Partial<YamlOption>[];

    // Unique aliases; remember which option each alias belongs to.
    const optionOf = new Map<string, number>();
    options.forEach((option, i) => {
      if (!Array.isArray(option?.names)) return;
      option.names.forEach((name: unknown, j: number) => {
        if (typeof name !== "string") return;
        const previous = optionOf.get(name);
        if (previous !== undefined)
          fail([...at, "options", i, "names", j], `alias "${name}" is already used by ${formatLocation([...at, "options", previous])}`);
        else optionOf.set(name, i);
      });
    });

    const mateClaimedBy = new Map<number, number>();
    options.forEach((option, i) => {
      const valueAt = [...at, "options", i, "value"];
      const value = option?.value as Partial<YamlValue> | undefined;
      checkValue(value, valueAt);
      if (typeof value?.mate_of === "string") {
        const mate = optionOf.get(value.mate_of);
        const mateValue = mate === undefined ? undefined : (options[mate]?.value as Partial<YamlValue> | undefined);
        if (mate === undefined) fail([...valueAt, "mate_of"], `"${value.mate_of}" is not an option of this command`);
        else if (mate === i) fail([...valueAt, "mate_of"], "an option cannot be its own mate");
        else if (value.read_role === undefined || mateValue?.read_role === undefined || value.read_role === mateValue.read_role) {
          fail([...valueAt, "mate_of"], "mates must have read roles 1 and 2");
        } else if (mateClaimedBy.has(mate)) {
          fail([...valueAt, "mate_of"], `"${value.mate_of}" is already the mate of ${formatLocation([...at, "options", mateClaimedBy.get(mate)!])}`);
        } else mateClaimedBy.set(mate, i);
      }
      (Array.isArray(option?.rules) ? option.rules : []).forEach((rule, r) => {
        const used = (rule as Partial<YamlRule> | null)?.when?.used;
        if (!Array.isArray(used)) return;
        used.forEach((alias, u) => {
          if (typeof alias === "string" && !optionOf.has(alias))
            fail([...at, "options", i, "rules", r, "when", "used", u], `"${alias}" is not an option of this command`);
        });
      });
      if (typeof value?.derive?.from === "string") {
        const source = optionOf.get(value.derive.from);
        if (source === undefined) fail([...valueAt, "derive", "from"], `"${value.derive.from}" is not an option of this command`);
        else if (source === i) fail([...valueAt, "derive", "from"], "an option cannot derive from itself");
        if (value.type !== "file") fail([...valueAt, "derive"], "a derived output only applies to type file");
      }
    });

    const args = Array.isArray(command.arguments) ? command.arguments : [];
    const argumentAt = new Map<string, number>();
    args.forEach((argument: unknown, i: number) => {
      const name = (argument as Partial<YamlArgument> | null)?.name;
      if (typeof name === "string") argumentAt.set(name, i);
    });
    const argumentMateClaimedBy = new Map<number, number>();
    args.forEach((argument: unknown, i: number) => {
      const arg = argument as Partial<YamlArgument> | null;
      if (arg?.variadic === true && i < args.length - 1) fail([...at, "arguments", i, "variadic"], "only the last positional argument may be variadic");
      const valueAt = [...at, "arguments", i, "value"];
      checkValue(arg?.value, valueAt);
      const value = arg?.value as Partial<YamlValue> | undefined;
      if (value?.derive !== undefined) fail([...valueAt, "derive"], "a derived output only applies to options");
      if (typeof value?.mate_of === "string") {
        const mate = argumentAt.get(value.mate_of);
        const mateValue = mate === undefined ? undefined : ((args[mate] as Partial<YamlArgument>)?.value as Partial<YamlValue> | undefined);
        if (mate === undefined) fail([...valueAt, "mate_of"], `"${value.mate_of}" is not an argument of this command`);
        else if (mate === i) fail([...valueAt, "mate_of"], "an argument cannot be its own mate");
        else if (value.read_role === undefined || mateValue?.read_role === undefined || value.read_role === mateValue.read_role) {
          fail([...valueAt, "mate_of"], "mates must have read roles 1 and 2");
        } else if (argumentMateClaimedBy.has(mate)) {
          fail([...valueAt, "mate_of"], `"${value.mate_of}" is already the mate of ${formatLocation([...at, "arguments", argumentMateClaimedBy.get(mate)!])}`);
        } else argumentMateClaimedBy.set(mate, i);
      }
    });

    const seenCommands = new Map<string, number>();
    (Array.isArray(command.commands) ? command.commands : []).forEach((child: unknown, i: number) => {
      const name = (child as { name?: unknown })?.name;
      if (typeof name === "string") {
        const previous = seenCommands.get(name);
        if (previous !== undefined)
          fail([...at, "commands", i, "name"], `subcommand "${name}" is already described at ${formatLocation([...at, "commands", previous])}`);
        else seenCommands.set(name, i);
      }
      checkCommand(child, [...at, "commands", i]);
    });
  };
  checkCommand(data, []);

  if (errors.length > before) return;
  return toToolSource(file, data as YamlTool);
};

// ---------------------------------------------------------------------------------------------
// Writing

const bool = (value: boolean) => (value ? 1 : 0);

const writeCatalog = (tools: ToolSource[], formats: FormatSource[], outputPath: string, biopilotVersion: string) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.rmSync(tempPath, { force: true });
  const db = new Database(tempPath);
  try {
    db.exec(CATALOG_DDL);
    const insertMeta = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    const insertFormat = db.prepare("INSERT INTO formats (ord, name, kind, description, pattern, suffixes, markers) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertTool = db.prepare(
      "INSERT INTO tools (name, package, description, platforms, version_args, version_regex, help_args) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insertCommand = db.prepare("INSERT INTO commands (tool_id, parent_id, name, help_args, description) VALUES (?, ?, ?, ?, ?)");
    const insertOption = db.prepare(
      `INSERT INTO options (command_id, canonical_name, description, value_type, value_formats, value_optional, value_multiple, read_role,
        default_value, rank, since_version, until_version, repeatable, hidden, deprecated, derive_suffix)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const linkOption = db.prepare("UPDATE options SET mate_of = ?, derive_from = ? WHERE id = ?");
    const insertName = db.prepare("INSERT INTO option_names (command_id, name, option_id, ord) VALUES (?, ?, ?, ?)");
    const indexOption = db.prepare("INSERT INTO options_fts (rowid, names, description) VALUES (?, ?, ?)");
    const insertOptionValue = db.prepare("INSERT INTO option_values (option_id, ord, value, description) VALUES (?, ?, ?, ?)");
    const insertArgument = db.prepare(
      `INSERT INTO arguments (command_id, position, name, description, variadic, value_type, value_formats, value_optional, value_multiple, read_role,
        default_value, since_version, until_version, mate_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertRule = db.prepare("INSERT INTO rules (option_id, ord, paired, platform, assay, boost) VALUES (?, ?, ?, ?, ?, ?)");
    const insertRuleUsed = db.prepare("INSERT INTO rule_used (option_id, rule_ord, ord, used_option_id) VALUES (?, ?, ?, ?)");
    const insertArgumentValue = db.prepare("INSERT INTO argument_values (command_id, position, ord, value, description) VALUES (?, ?, ?, ?, ?)");

    const valueColumns = (value: ValueSource | null) => [
      value?.type ?? null,
      value && value.formats.length > 0 ? JSON.stringify(value.formats) : null,
      bool(value?.optional ?? false),
      bool(value?.multiple ?? false),
      value?.readRole ?? null,
    ];

    db.transaction(() => {
      insertMeta.run("schema_version", String(CATALOG_SCHEMA_VERSION));
      insertMeta.run("biopilot_version", biopilotVersion);
      formats.forEach((format, ord) =>
        insertFormat.run(
          ord,
          format.name,
          format.kind,
          format.description ?? null,
          format.pattern ?? null,
          format.suffixes ? JSON.stringify(format.suffixes) : null,
          format.markers.length > 0 ? JSON.stringify(format.markers) : null,
        ),
      );
      // Deterministic order (reproducible builds): tools by name, then YAML order everywhere.
      for (const tool of [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const toolId = insertTool.run(
          tool.name,
          tool.package ?? null,
          tool.description ?? null,
          JSON.stringify(tool.platforms),
          JSON.stringify(tool.versionArgs),
          tool.versionRegex,
          tool.root.helpArgs ? JSON.stringify(tool.root.helpArgs) : null,
        ).lastInsertRowid;
        // Depth-first, in YAML order: a command's id always follows its parent's.
        const insertTree = (command: CommandSource, parentId: number | bigint | null) => {
          const commandId = insertCommand.run(
            toolId,
            parentId,
            command.name,
            command.helpArgs ? JSON.stringify(command.helpArgs) : null,
            command.description ?? null,
          ).lastInsertRowid;
          const idByAlias = new Map<string, number | bigint>();
          const optionIds = command.options.map((option) => {
            const optionId = insertOption.run(
              commandId,
              canonicalName(option.names),
              option.description ?? null,
              ...valueColumns(option.value),
              option.defaultValue ?? null,
              option.rank,
              option.since ?? null,
              option.until ?? null,
              bool(option.repeatable),
              bool(option.hidden),
              bool(option.deprecated),
              option.derive?.suffix ?? null,
            ).lastInsertRowid;
            option.names.forEach((name, ord) => {
              insertName.run(commandId, name, optionId, ord);
              idByAlias.set(name, optionId);
            });
            option.value?.values.forEach((item, ord) => insertOptionValue.run(optionId, ord, item.value, item.description ?? null));
            indexOption.run(optionId, option.names.join(" "), option.description ?? "");
            return optionId;
          });
          // References to other options of the command, once they all have ids.
          command.options.forEach((option, i) => {
            if (option.mateOf || option.derive) {
              linkOption.run(option.mateOf ? idByAlias.get(option.mateOf) : null, option.derive ? idByAlias.get(option.derive.from) : null, optionIds[i]);
            }
            option.rules.forEach((rule, ord) => {
              const { paired, platform, assay, used = [] } = rule.when;
              insertRule.run(optionIds[i], ord, paired === undefined ? null : bool(paired), platform ?? null, assay ?? null, rule.boost);
              used.forEach((alias, u) => insertRuleUsed.run(optionIds[i], ord, u, idByAlias.get(alias)));
            });
          });
          const argumentPosition = new Map(command.arguments.map((argument, position) => [argument.name, position]));
          command.arguments.forEach((argument, position) => {
            insertArgument.run(
              commandId,
              position,
              argument.name,
              argument.description ?? null,
              bool(argument.variadic),
              ...valueColumns(argument.value),
              argument.defaultValue ?? null,
              argument.since ?? null,
              argument.until ?? null,
              argument.mateOf ? argumentPosition.get(argument.mateOf) ?? null : null,
            );
            argument.value?.values.forEach((item, ord) => insertArgumentValue.run(commandId, position, ord, item.value, item.description ?? null));
          });
          for (const child of command.commands) insertTree(child, commandId);
        };
        insertTree(tool.root, null);
      }
    })();
    db.exec("VACUUM");
  } finally {
    db.close();
  }
  fs.renameSync(tempPath, outputPath);
};

/** Validates every tool YAML in `sourcesDir` (and the formats file) and, if all are valid, writes the Catalog. */
export const compileCatalog = ({ sourcesDir, formatsPath, outputPath, biopilotVersion }: CompileOptions): CompileResult => {
  const errors: CompileError[] = [];
  let files: string[];
  try {
    files = fs
      .readdirSync(sourcesDir)
      .filter((file) => /\.ya?ml$/.test(file))
      .sort();
  } catch {
    return { ok: false, errors: [{ file: sourcesDir, location: "folder", message: "sources folder not found or unreadable" }] };
  }

  const formats = readFormats(formatsPath, errors);
  const formatKinds = new Map((formats ?? []).map((format) => [format.name, format.kind]));

  const tools: ToolSource[] = [];
  const seenTools = new Map<string, string>();
  for (const file of files) {
    const tool = readToolSource(sourcesDir, file, formatKinds, errors);
    if (!tool) continue;
    const previous = seenTools.get(tool.name);
    if (previous) errors.push({ file, location: "name", message: `tool "${tool.name}" is already described in ${previous}` });
    else {
      seenTools.set(tool.name, file);
      tools.push(tool);
    }
  }

  if (errors.length > 0 || !formats) return { ok: false, errors };
  writeCatalog(tools, formats, outputPath, biopilotVersion);
  return { ok: true, toolCount: tools.length };
};
