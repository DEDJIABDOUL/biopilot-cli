// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine's view of the Catalog: a Fig spec built from the Catalog for a Tool (spec M3).
// The engine keeps parsing the line and rendering; BioPilot only says what a Tool accepts.

import { openCatalog, type Catalog, type Option } from "../knowledge/catalog.js";

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

/** Canonical name first, so that the engine shows it and matches it first. */
const optionNames = (option: Option): string[] => [option.canonicalName, ...option.aliases.filter((alias) => alias !== option.canonicalName)];

const toFigOption = (option: Option): Fig.Option => ({
  name: optionNames(option),
  description: option.description ?? undefined,
  priority: option.rank,
  ...(option.value
    ? { args: { name: option.value.formats.length > 0 ? option.value.formats.join("|") : option.value.type, isOptional: option.value.optional } }
    : {}),
});

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
    if (current && tool && root) {
      spec = { name: tool.name, description: tool.description ?? undefined, options: current.listOptions(root).map(toFigOption) };
    }
  } catch {
    spec = null; // fail silently: the engine falls back to Fig
  }
  specs.set(toolName, spec);
  return spec ?? undefined;
};
