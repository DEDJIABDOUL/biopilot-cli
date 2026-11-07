// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine's view of the Catalog: a Fig spec built from the Catalog for a Tool (spec M3).
// The engine keeps parsing the line and rendering; BioPilot only says what a Tool accepts.

import { openCatalog, type Argument, type Catalog, type Command, type Option, type ValueSpec } from "../knowledge/catalog.js";
import { optionRanking } from "./ranking.js";

/** Below every Rank (0–100): deprecated options come last, whatever their Rank. */
const DEPRECATED_PRIORITY = -1;

/**
 * The engine tells arrays apart with `instanceof Array`, so every array of a spec must be of the engine's realm.
 * The Catalog's rows can be arrays of another realm (under Jest, the SQLite addon is loaded once per worker, #36);
 * `Array.from` rebuilds them in this one.
 */
const mapLocal = <T, U>(items: readonly T[], map: (item: T) => U): U[] => Array.from(items, (item) => map(item));

/** The Catalog, opened once per session; `null` when unavailable (the engine then falls back to Fig). */
let catalog: Catalog | null | undefined;
const specs = new Map<string, Fig.Subcommand | null>();

const getCatalog = (): Catalog | null => {
  if (catalog === undefined) {
    const opened = openCatalog();
    catalog = opened.available ? opened.catalog : null;
  }
  return catalog;
};

/** What a value takes, as a Fig argument: files or folders, suggested values, optional, several. */
const valueArg = (value: ValueSpec, name: string, description?: string): Fig.Arg => ({
  name,
  ...(description ? { description } : {}),
  isOptional: value.optional,
  isVariadic: value.multiple,
  ...(value.type === "file" ? { template: "filepaths" as const } : value.type === "dir" ? { template: "folders" as const } : {}),
  ...(value.values.length > 0 ? { suggestions: mapLocal(value.values, (v) => ({ name: v.value, description: v.description ?? undefined })) } : {}),
});

const valueName = (value: ValueSpec) => (value.formats.length > 0 ? value.formats.join("|") : value.type);

/** Canonical name first, so that the engine shows it and matches it first. */
const optionNames = (option: Option): string[] => [option.canonicalName, ...option.aliases.filter((alias) => alias !== option.canonicalName)];

const toFigOption = (option: Option): Fig.Option => {
  const figOption: Fig.Option = {
    name: optionNames(option),
    description: option.description ?? undefined,
    priority: option.deprecated ? DEPRECATED_PRIORITY : option.rank,
    ...(option.value ? { args: valueArg(option.value, valueName(option.value)) } : {}),
    ...(option.repeatable ? { isRepeatable: true } : {}),
    ...(option.hidden ? { hidden: true } : {}),
  };
  optionRanking.set(figOption, { canonicalName: option.canonicalName, rules: option.rules, deprecated: option.deprecated });
  return figOption;
};

const toFigArg = (argument: Argument): Fig.Arg => {
  const base = argument.value
    ? valueArg(argument.value, argument.name, argument.description ?? undefined)
    : { name: argument.name, description: argument.description ?? undefined };
  return { ...base, isVariadic: argument.variadic || (argument.value?.multiple ?? false) };
};

const toFigCommand = (current: Catalog, command: Command, name: string, description: string | undefined): Fig.Subcommand => {
  const args = mapLocal(current.listArguments(command), toFigArg);
  const subcommands = mapLocal(current.listSubcommands(command), (sub) =>
    toFigCommand(current, sub, sub.path[sub.path.length - 1], sub.description ?? undefined),
  );
  return {
    name,
    ...(description ? { description } : {}),
    options: mapLocal(current.listOptions(command), toFigOption),
    ...(args.length > 0 ? { args } : {}),
    ...(subcommands.length > 0 ? { subcommands } : {}),
  };
};

/** The Catalog's Tools (name and description), for command-name completion (spec M6); empty when unavailable. */
let tools: { name: string; description: string | undefined }[] | undefined;
export const catalogTools = (): { name: string; description: string | undefined }[] => {
  if (tools === undefined) {
    try {
      const listed = getCatalog()?.listTools() ?? [];
      tools = mapLocal(listed, (tool) => ({ name: tool.name, description: tool.description ?? undefined }));
    } catch {
      tools = [];
    }
  }
  return tools;
};

/**
 * The spec of a Catalog Tool, or nothing when the Tool isn't in the Catalog or the Catalog is unavailable.
 * Never throws; built once per Tool per session.
 */
export const catalogSpec = (toolName: string): Fig.Subcommand | undefined => {
  if (specs.has(toolName)) return specs.get(toolName) ?? undefined;
  let spec: Fig.Subcommand | null = null;
  try {
    const current = getCatalog();
    const tool = current?.getTool(toolName);
    const root = tool ? current?.getCommand(tool.name) : undefined;
    if (current && tool && root) spec = toFigCommand(current, root, tool.name, tool.description ?? undefined);
  } catch {
    spec = null; // fail silently: the engine falls back to Fig
  }
  specs.set(toolName, spec);
  return spec ?? undefined;
};
