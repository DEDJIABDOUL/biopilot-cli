// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Build-time only: compiles the tool YAML sources into the Catalog.
// Never imported by the runtime (the YAML parser is a dev dependency).

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import _Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { LineCounter, parseDocument } from "yaml";
import { CATALOG_DDL, CATALOG_SCHEMA_VERSION, canonicalName, type Platform, type ValueType } from "./schema.js";

// ajv is CommonJS; under ESM its default export is the module object (same workaround as utils/config.ts).
const Ajv = _Ajv as unknown as typeof _Ajv.default;

export type CompileError = {
  /** Source file, relative to the sources folder. */
  file: string;
  /** Location inside the YAML, e.g. `options[2].names`; `document` for the whole file. */
  location: string;
  /** 1-based line in the source file, when known. */
  line?: number;
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

type YamlOption = {
  names: string[];
  description?: string;
  value?: { type: ValueType };
  default?: string | number | boolean;
  rank?: number;
  rules?: unknown[];
};

type YamlTool = {
  name: string;
  package?: string;
  description?: string;
  platforms?: Platform[];
  version: { args: string[]; regex: string };
  help?: string[];
  options?: YamlOption[];
};

/** The published schema (schemas/tool.schema.json), resolved from src/ or build/ alike. */
export const TOOL_SCHEMA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schemas", "tool.schema.json");

let validator: ValidateFunction | undefined;
const validateTool = (data: unknown): ErrorObject[] => {
  if (!validator) {
    const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
    validator = ajv.compile(JSON.parse(fs.readFileSync(TOOL_SCHEMA_PATH, "utf-8")));
  }
  return validator(data) ? [] : validator.errors ?? [];
};

type Segment = string | number;

/** `["options", 1, "rank"]` → `options[1].rank`. */
const formatLocation = (segments: readonly Segment[]): string =>
  segments.reduce<string>((text, segment) => (typeof segment === "number" ? `${text}[${segment}]` : text ? `${text}.${segment}` : segment), "") || "document";

const pointerSegments = (pointer: string): Segment[] =>
  pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

const schemaErrorDetails = (error: ErrorObject): { segments: Segment[]; message: string } => {
  const segments = pointerSegments(error.instancePath);
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case "required":
      return { segments: [...segments, String(params.missingProperty)], message: "required field is missing" };
    case "additionalProperties":
      return { segments: [...segments, String(params.additionalProperty)], message: "unknown field" };
    case "enum":
      return { segments, message: `must be one of: ${(params.allowedValues as unknown[]).join(", ")}` };
    case "pattern":
      if (segments.at(-2) === "names") return { segments, message: "is not an option name (expected -x or --long-name)" };
      return { segments, message: `${error.message}` };
    default:
      return { segments, message: `${error.message}` };
  }
};

/** Number of capture groups of a regular expression. */
const captureGroups = (regex: RegExp): number => (new RegExp(`${regex.source}|`).exec("") as RegExpExecArray).length - 1;

const toToolSource = (file: string, tool: YamlTool): ToolSource => ({
  file,
  name: tool.name,
  package: tool.package,
  description: tool.description,
  platforms: tool.platforms ?? [],
  versionArgs: tool.version.args,
  versionRegex: tool.version.regex,
  helpArgs: tool.help,
  options: (tool.options ?? []).map((option) => ({
    names: option.names,
    description: option.description,
    valueType: option.value?.type ?? null,
    defaultValue: option.default === undefined ? undefined : String(option.default),
    rank: option.rank ?? 50,
  })),
});

/** Reads and checks one YAML file, appending every problem found to `errors`. */
const readToolSource = (sourcesDir: string, file: string, errors: CompileError[]): ToolSource | undefined => {
  const text = fs.readFileSync(path.join(sourcesDir, file), "utf-8");
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      errors.push({ file, location: "document", line: lineCounter.linePos(error.pos[0]).line, message: error.message });
    }
    return;
  }

  /** Line of the closest existing node on the path (a missing field points at its parent). */
  const lineOf = (segments: readonly Segment[]): number | undefined => {
    for (let depth = segments.length; depth >= 0; depth--) {
      const node = depth === 0 ? doc.contents : doc.getIn(segments.slice(0, depth), true);
      const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
      if (range) return lineCounter.linePos(range[0]).line;
    }
  };
  const fail = (segments: readonly Segment[], message: string) => errors.push({ file, location: formatLocation(segments), line: lineOf(segments), message });

  const data: unknown = doc.toJS();
  const before = errors.length;
  for (const error of validateTool(data)) {
    const { segments, message } = schemaErrorDetails(error);
    fail(segments, message);
  }

  // Semantic checks. They run even when the schema failed, on whatever parts are well-formed,
  // so a contributor sees every problem of the file at once.
  const loose = data as { version?: { regex?: unknown }; options?: unknown };
  const regex = loose?.version?.regex;
  if (typeof regex === "string" && regex.length > 0) {
    try {
      const groups = captureGroups(new RegExp(regex));
      if (groups !== 1) fail(["version", "regex"], `must have exactly one capture group (the version number), found ${groups}`);
    } catch (error) {
      fail(["version", "regex"], `is not a valid regular expression: ${(error as Error).message}`);
    }
  }
  const seenNames = new Map<string, number>();
  (Array.isArray(loose?.options) ? loose.options : []).forEach((option: unknown, i: number) => {
    const names = (option as { names?: unknown })?.names;
    if (!Array.isArray(names)) return;
    names.forEach((name: unknown, j: number) => {
      if (typeof name !== "string") return;
      const previous = seenNames.get(name);
      if (previous !== undefined) fail(["options", i, "names", j], `alias "${name}" is already used by options[${previous}]`);
      else seenNames.set(name, i);
    });
  });
  const tool = data as YamlTool;
  if (errors.length > before) return;
  return toToolSource(file, tool);
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
