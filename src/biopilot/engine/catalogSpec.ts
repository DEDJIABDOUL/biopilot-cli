// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine's view of the Catalog: a Fig spec built from the Catalog for a Tool (spec M3), for the binary
// the shell would run (spec §6.5): its Profile enriched by the Catalog, else the Catalog filtered by its
// version, else the Catalog alone. The engine keeps parsing the line and rendering; BioPilot only says
// what a Tool accepts.

import { resolveBinary, type Binary } from "../env/resolver.js";
import { sessionEnvironment } from "../env/session.js";
import { withinVersions } from "../env/versionOrder.js";
import { openCatalog, type Argument, type Catalog, type Command, type Option, type ValueSpec } from "../knowledge/catalog.js";
import { knownVersion } from "../profile/compute.js";
import { requestProfile } from "../profile/detached.js";
import type { HelpOption } from "../profile/helpParser.js";
import { openUserStore, versionKey, type UserStore } from "../profile/userStore.js";
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
/** Built specs, by Tool and what they were built for (binary, version, Profiles found). */
const specs = new Map<string, { key: string; spec: Fig.Subcommand | null; checkedAt: number }>();
/** Below this age, a spec built without every Profile is reused as is; older, the User store is asked again. */
const PROFILE_RECHECK_MS = 500;
/** Rank of an option the Catalog doesn't know (spec §6.4 scale: the default). */
const PROFILE_ONLY_RANK = 50;
/** Versions by Fingerprint: conda-meta is read once per binary. */
const versions = new Map<string, string | undefined>();
let userStore: UserStore | undefined;

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

/** What a spec is built for: the active binary's version and the User store holding its Profiles. */
type Installed = { tool: string; version: string | undefined; key: string; store: UserStore | undefined };

/** A Profile option the Catalog doesn't know: the help's own description, the default rank. */
const toProfileOnlyOption = (option: HelpOption): Fig.Option => {
  const long = option.names.filter((name) => name.startsWith("--"));
  return {
    name: [...long, ...option.names.filter((name) => !name.startsWith("--"))],
    description: option.description ?? undefined,
    priority: PROFILE_ONLY_RANK,
    ...(option.takesValue ? { args: { name: "value" } } : {}),
  };
};

/**
 * A Command's options for the installed binary. With a Profile (non-empty), its options: those the Catalog
 * also has (by any alias) as the Catalog describes them, the others from the help; Catalog options the
 * Profile lacks are dropped. Without one, the Catalog's, filtered by version when it is known.
 */
const commandOptions = (current: Catalog, command: Command, installed: Installed | undefined): { options: Fig.Option[]; complete: boolean } => {
  const catalogOptions = current.listOptions(command);
  const profile = installed?.store?.getProfile(installed.tool, installed.key, command.path.join(" "));
  if (profile && profile.options.length > 0) {
    const byAlias = new Map(catalogOptions.flatMap((option) => option.aliases.map((alias) => [alias, option] as const)));
    const kept = new Set<Option>();
    const extra: Fig.Option[] = [];
    for (const helpOption of profile.options) {
      const known = helpOption.names.map((name) => byAlias.get(name)).find((option) => option !== undefined);
      if (known) kept.add(known);
      else extra.push(toProfileOnlyOption(helpOption));
    }
    // Catalog order (highest rank first) for the known ones, then the help's own.
    return {
      options: [
        ...mapLocal(
          catalogOptions.filter((option) => kept.has(option)),
          toFigOption,
        ),
        ...extra,
      ],
      complete: true,
    };
  }
  const version = installed?.version;
  const listed = version === undefined ? catalogOptions : catalogOptions.filter((option) => withinVersions(version, option.since, option.until));
  // A missing Profile may land later (sync, detached computation); a computed but empty one never will.
  return { options: mapLocal(listed, toFigOption), complete: installed === undefined || profile !== undefined };
};

const toFigCommand = (
  current: Catalog,
  command: Command,
  name: string,
  description: string | undefined,
  installed: Installed | undefined,
): { spec: Fig.Subcommand; complete: boolean } => {
  const args = mapLocal(current.listArguments(command), toFigArg);
  let complete = true;
  const subcommands = mapLocal(current.listSubcommands(command), (sub) => {
    const built = toFigCommand(current, sub, sub.path[sub.path.length - 1], sub.description ?? undefined, installed);
    complete &&= built.complete;
    return built.spec;
  });
  const own = commandOptions(current, command, installed);
  return {
    spec: {
      name,
      ...(description ? { description } : {}),
      options: own.options,
      ...(args.length > 0 ? { args } : {}),
      ...(subcommands.length > 0 ? { subcommands } : {}),
    },
    complete: complete && own.complete,
  };
};

/** The User store, opened once it exists (`biopilot sync` or a detached computation may create it later). */
const getUserStore = (): UserStore | undefined => (userStore ??= openUserStore({ create: false }));

/** The binary the shell would run for a Tool, and its version; nothing when it is not installed. */
const installedFor = (current: Catalog, tool: string): { binary: Binary; installed: Installed } | undefined => {
  const binary = resolveBinary(tool, sessionEnvironment().PATH);
  const query = binary ? current.getToolQuery(tool) : undefined;
  if (!binary || !query) return;
  const store = getUserStore();
  if (!versions.has(binary.fingerprint) || versions.get(binary.fingerprint) === undefined) versions.set(binary.fingerprint, knownVersion(binary, query, store));
  const version = versions.get(binary.fingerprint);
  return { binary, installed: { tool, version, key: versionKey(version, binary.fingerprint), store } };
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
 * The spec of a Catalog Tool for the binary the shell would run, or nothing when the Tool isn't in the
 * Catalog or the Catalog is unavailable. Never throws; rebuilt only when the binary, its version or its
 * Profiles change.
 */
export const catalogSpec = (toolName: string): Fig.Subcommand | undefined => {
  const cached = specs.get(toolName);
  if (cached?.spec === null) return undefined; // not a Catalog Tool: settled for the session
  try {
    const current = getCatalog();
    const tool = current?.getTool(toolName);
    const root = tool ? current?.getCommand(tool.name) : undefined;
    if (!current || !tool || !root) {
      specs.set(toolName, { key: "", spec: null, checkedAt: 0 });
      return undefined;
    }
    const found = installedFor(current, tool.name);
    const key = found ? `${found.binary.fingerprint}\0${found.installed.key}` : "";
    const now = Date.now();
    if (cached && cached.key === key && (cached.checkedAt === Infinity || now - cached.checkedAt < PROFILE_RECHECK_MS)) return cached.spec ?? undefined;
    const built = toFigCommand(current, root, tool.name, tool.description ?? undefined, found?.installed);
    specs.set(toolName, { key, spec: built.spec, checkedAt: built.complete ? Infinity : now });
    // A Profile is missing: computed aside (once per binary per session); a later suggestion picks it up.
    if (found && !built.complete) requestProfile(tool.name, found.binary, sessionEnvironment().PATH);
    return built.spec;
  } catch {
    return cached?.spec ?? undefined; // fail silently: the engine falls back to what it had, or to Fig
  }
};
