// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Build-time only: compiles the tool YAML sources into the Catalog.
// Never imported by the runtime (the YAML parser is a dev dependency).

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LineCounter, parseDocument } from "yaml";
import { CATALOG_DDL, CATALOG_SCHEMA_VERSION, PLATFORMS, VALUE_TYPES, canonicalName, type Platform, type ValueType } from "./schema.js";

export type CompileError = {
  /** Source file, relative to the sources folder. */
  file: string;
  /** Location inside the YAML, e.g. `options[2].names`, or `line 4` for syntax errors. */
  location: string;
  message: string;
};

export type CompileResult = { ok: true; toolCount: number } | { ok: false; errors: CompileError[] };

export type CompileOptions = {
  /** Folder holding one `<tool>.yml` (or `.yaml`) file per Tool. */
  sourcesDir: string;
  /** Path of the Catalog file to write. Replaced atomically on success, untouched on failure. */
  outputPath: string;
  /** BioPilot version recorded in the Catalog metadata. */
  biopilotVersion: string;
};

type OptionSource = {
  names: string[];
  description?: string;
  valueType: ValueType | null;
  defaultValue?: string;
  rank: number;
};

type ToolSource = {
  file: string;
  name: string;
  package?: string;
  description?: string;
  platforms: Platform[];
  versionArgs: string[];
  versionRegex: string;
  helpArgs?: string[];
  options: OptionSource[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/** Reads and checks one YAML file, appending every problem found to `errors`. */
const readToolSource = (sourcesDir: string, file: string, errors: CompileError[]): ToolSource | undefined => {
  const fail = (location: string, message: string) => errors.push({ file, location, message });
  const text = fs.readFileSync(path.join(sourcesDir, file), "utf-8");
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) fail(`line ${lineCounter.linePos(error.pos[0]).line}`, error.message);
    return;
  }
  const data: unknown = doc.toJS();
  if (!isRecord(data)) {
    fail("document", "expected a mapping describing one tool");
    return;
  }
  const before = errors.length;

  if (typeof data.name !== "string" || data.name.length === 0) fail("name", "required non-empty string");
  for (const field of ["package", "description"] as const) {
    if (data[field] !== undefined && typeof data[field] !== "string") fail(field, "must be a string");
  }

  const platforms = data.platforms ?? [];
  if (!isStringArray(platforms)) fail("platforms", "must be a list of platforms");
  else
    platforms.forEach((platform, i) => {
      if (!(PLATFORMS as readonly string[]).includes(platform))
        fail(`platforms[${i}]`, `unknown platform "${platform}" (expected one of: ${PLATFORMS.join(", ")})`);
    });

  const version = data.version;
  if (!isRecord(version)) fail("version", "required mapping with `args` and `regex`");
  else {
    if (!isStringArray(version.args) || version.args.length === 0) fail("version.args", "required non-empty list of strings");
    if (typeof version.regex !== "string" || version.regex.length === 0) fail("version.regex", "required non-empty string");
  }
  if (data.help !== undefined && !isStringArray(data.help)) fail("help", "must be a list of strings");

  const options: OptionSource[] = [];
  if (data.options !== undefined && !Array.isArray(data.options)) fail("options", "must be a list");
  const seenNames = new Map<string, number>();
  ((Array.isArray(data.options) ? data.options : []) as unknown[]).forEach((option, i) => {
    const at = `options[${i}]`;
    if (!isRecord(option)) {
      fail(at, "expected a mapping");
      return;
    }
    const optionErrors = errors.length;
    if (!isStringArray(option.names) || option.names.length === 0) fail(`${at}.names`, "required non-empty list of strings");
    else
      option.names.forEach((name, j) => {
        if (!/^--?[^\s-][^\s]*$/.test(name)) fail(`${at}.names[${j}]`, `"${name}" is not an option name (expected -x or --long-name)`);
        const previous = seenNames.get(name);
        if (previous !== undefined) fail(`${at}.names[${j}]`, `alias "${name}" already used by options[${previous}]`);
        else seenNames.set(name, i);
      });
    if (option.description !== undefined && typeof option.description !== "string") fail(`${at}.description`, "must be a string");
    let valueType: ValueType | null = null;
    if (option.value !== undefined) {
      if (!isRecord(option.value) || typeof option.value.type !== "string") fail(`${at}.value`, "must be a mapping with a `type`");
      else if (!(VALUE_TYPES as readonly string[]).includes(option.value.type)) {
        fail(`${at}.value.type`, `unknown value type "${option.value.type}" (expected one of: ${VALUE_TYPES.join(", ")}; omit \`value\` for a flag)`);
      } else valueType = option.value.type as ValueType;
    }
    const rank = option.rank ?? 50;
    if (typeof rank !== "number" || !Number.isInteger(rank)) fail(`${at}.rank`, "must be an integer");
    if (option.default !== undefined && !["string", "number", "boolean"].includes(typeof option.default)) fail(`${at}.default`, "must be a scalar");
    if (errors.length === optionErrors) {
      options.push({
        names: option.names as string[],
        description: option.description as string | undefined,
        valueType,
        defaultValue: option.default === undefined ? undefined : String(option.default),
        rank: rank as number,
      });
    }
  });

  if (errors.length > before) return;
  const checkedVersion = version as { args: string[]; regex: string };
  return {
    file,
    name: data.name as string,
    package: data.package as string | undefined,
    description: data.description as string | undefined,
    platforms: platforms as Platform[],
    versionArgs: checkedVersion.args,
    versionRegex: checkedVersion.regex,
    helpArgs: data.help as string[] | undefined,
    options,
  };
};

const writeCatalog = (tools: ToolSource[], outputPath: string, biopilotVersion: string) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.rmSync(tempPath, { force: true });
  const db = new Database(tempPath);
  try {
    db.exec(CATALOG_DDL);
    const insertMeta = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    const insertTool = db.prepare(
      "INSERT INTO tools (name, package, description, platforms, version_args, version_regex, help_args) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insertCommand = db.prepare("INSERT INTO commands (tool_id, parent_id, name, help_args, description) VALUES (?, NULL, '', ?, NULL)");
    const insertOption = db.prepare("INSERT INTO options (command_id, canonical_name, description, value_type, default_value, rank) VALUES (?, ?, ?, ?, ?, ?)");
    const insertName = db.prepare("INSERT INTO option_names (command_id, name, option_id, ord) VALUES (?, ?, ?, ?)");
    db.transaction(() => {
      insertMeta.run("schema_version", String(CATALOG_SCHEMA_VERSION));
      insertMeta.run("biopilot_version", biopilotVersion);
      // Deterministic order (reproducible builds): tools by name, options in YAML order.
      for (const tool of [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const toolId = insertTool.run(
          tool.name,
          tool.package ?? null,
          tool.description ?? null,
          JSON.stringify(tool.platforms),
          JSON.stringify(tool.versionArgs),
          tool.versionRegex,
          tool.helpArgs ? JSON.stringify(tool.helpArgs) : null,
        ).lastInsertRowid;
        const commandId = insertCommand.run(toolId, tool.helpArgs ? JSON.stringify(tool.helpArgs) : null).lastInsertRowid;
        for (const option of tool.options) {
          const optionId = insertOption.run(
            commandId,
            canonicalName(option.names),
            option.description ?? null,
            option.valueType,
            option.defaultValue ?? null,
            option.rank,
          ).lastInsertRowid;
          option.names.forEach((name, ord) => insertName.run(commandId, name, optionId, ord));
        }
      }
    })();
    db.exec("VACUUM");
  } finally {
    db.close();
  }
  fs.renameSync(tempPath, outputPath);
};

/** Validates every tool YAML in `sourcesDir` and, if all are valid, writes the Catalog. */
export const compileCatalog = ({ sourcesDir, outputPath, biopilotVersion }: CompileOptions): CompileResult => {
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

  const tools: ToolSource[] = [];
  const seenTools = new Map<string, string>();
  for (const file of files) {
    const tool = readToolSource(sourcesDir, file, errors);
    if (!tool) continue;
    const previous = seenTools.get(tool.name);
    if (previous) errors.push({ file, location: "name", message: `tool "${tool.name}" is already described in ${previous}` });
    else {
      seenTools.set(tool.name, file);
      tools.push(tool);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  writeCatalog(tools, outputPath, biopilotVersion);
  return { ok: true, toolCount: tools.length };
};
