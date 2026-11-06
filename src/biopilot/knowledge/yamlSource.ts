// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Build-time only: loads a YAML source file, validates it against a published JSON Schema and
// reports every problem with its file, location and line.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import _Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { LineCounter, parseDocument } from "yaml";

// ajv is CommonJS; under ESM its default export is the module object (same workaround as utils/config.ts).
const Ajv = _Ajv as unknown as typeof _Ajv.default;

export type CompileError = {
  /** Source file: relative to the tool sources folder for tools, as given for the formats file. */
  file: string;
  /** Location inside the YAML, e.g. `options[2].names`; `document` for the whole file. */
  location: string;
  /** 1-based line in the source file, when known. */
  line?: number;
  message: string;
};

/** A path inside a YAML document: mapping keys and list indexes. */
export type Segment = string | number;

/** Published schemas folder, resolved from src/ or build/ alike. */
export const SCHEMAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schemas");

/** `["options", 1, "rank"]` → `options[1].rank`. */
export const formatLocation = (segments: readonly Segment[]): string =>
  segments.reduce<string>((text, segment) => (typeof segment === "number" ? `${text}[${segment}]` : text ? `${text}.${segment}` : segment), "") || "document";

const pointerSegments = (pointer: string): Segment[] =>
  pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

const schemaErrorDetails = (error: ErrorObject): { segments: Segment[]; message: string } | undefined => {
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
    case "if":
      return; // the failing `then` branch is reported on its own
    case "not":
      return { segments, message: "has fields that do not go together (check the fields allowed for this kind)" };
    default:
      return { segments, message: `${error.message}` };
  }
};

/** A JSON Schema validator over a published schema file, compiled on first use. */
export const schemaValidator = (schemaFile: string): ((data: unknown) => ErrorObject[]) => {
  let validate: ValidateFunction | undefined;
  return (data) => {
    if (!validate) {
      const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
      validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, schemaFile), "utf-8")));
    }
    return validate(data) ? [] : validate.errors ?? [];
  };
};

export type LoadedYaml = {
  data: unknown;
  /** Records an error at a location of this file. */
  fail: (segments: readonly Segment[], message: string) => void;
};

/**
 * Parses `filePath` and validates it. Schema errors are appended to `errors` but the document is still
 * returned, so semantic checks can report their own problems too. Returns nothing on a syntax error.
 */
export const loadYaml = (filePath: string, file: string, validate: (data: unknown) => ErrorObject[], errors: CompileError[]): LoadedYaml | undefined => {
  const lineCounter = new LineCounter();
  const doc = parseDocument(fs.readFileSync(filePath, "utf-8"), { lineCounter, prettyErrors: false });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) errors.push({ file, location: "document", line: lineCounter.linePos(error.pos[0]).line, message: error.message });
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
  for (const error of validate(data)) {
    const details = schemaErrorDetails(error);
    if (details) fail(details.segments, details.message);
  }
  return { data, fail };
};

/**
 * Number of capture groups of a regular expression. Appending `|` makes the regex match the empty
 * string, and a match result always has one slot per group after the whole match.
 */
export const captureGroups = (regex: RegExp): number => (new RegExp(`${regex.source}|`).exec("") as RegExpExecArray).length - 1;
