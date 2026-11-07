// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine's view of the Catalog: a Fig spec built from the Catalog for a Tool (spec M3), for the binary
// the shell would run (spec §6.5): its Profile enriched by the Catalog, else the Catalog filtered by its
// version, else the Catalog alone. The engine keeps parsing the line and rendering; BioPilot only says
// what a Tool accepts.

import { resolveBinary, type Binary } from "../env/resolver.js";
import { sessionEnvironment } from "../env/session.js";
import { withinVersions } from "../env/versionOrder.js";
import type { Argument, Catalog, Command, Option, ToolQuery, ValueSpec } from "../knowledge/catalog.js";
import { getCatalog, projectAt } from "./catalogAccess.js";
import { condaMetaVersion, type VersionSource } from "../env/version.js";
import { requestProfile } from "../profile/detached.js";
import type { HelpOption } from "../profile/helpParser.js";
import { openUserStore, versionKey, type LearnedTool, type UserStore } from "../profile/userStore.js";
import { fileGenerator, type FileValueContext } from "./fileValues.js";
import { optionRanking } from "./ranking.js";

/** Below every Rank (0–100): deprecated options come last, whatever their Rank. */
const DEPRECATED_PRIORITY = -1;

/**
 * The engine tells arrays apart with `instanceof Array`, so every array of a spec must be of the engine's realm.
 * The Catalog's rows can be arrays of another realm (under Jest, the SQLite addon is loaded once per worker, #36);
 * `Array.from` rebuilds them in this one.
 */
const mapLocal = <T, U>(items: readonly T[], map: (item: T) => U): U[] => Array.from(items, (item) => map(item));

/** What BioPilot last detected for a Tool, for the status line (M7). */
export type ToolDetection = { installed: boolean; version: string | undefined; versionSource: VersionSource | undefined; profilesPending: boolean };
const detections = new Map<string, ToolDetection>();
/** What was detected for a Tool by its last spec, or nothing when no suggestion was made for it yet. */
export const detectionOf = (toolName: string): ToolDetection | undefined => detections.get(toolName);

/** Built specs, by Tool and what they were built for (binary, version, Profiles found). */
const specs = new Map<string, { key: string; spec: Fig.Subcommand | null; checkedAt: number }>();
/** How long a name that is neither a Catalog Tool nor a learned one stays known as such. */
const UNKNOWN_RECHECK_MS = 2_000;
/** Below this age, a spec built without every Profile is reused as is; older, the User store is asked again. */
const PROFILE_RECHECK_MS = 500;
/** Rank of an option the Catalog doesn't know (spec §6.4 scale: the default). */
const PROFILE_ONLY_RANK = 50;
/** Versions by Fingerprint: conda-meta is read once per binary. */
const versions = new Map<string, { version: string; source: VersionSource } | undefined>();
let userStore: UserStore | undefined;

/** Every name of each option of a command, by canonical name: how values refer to other options. */
type NamesOf = (canonicalName: string) => readonly string[];
const namesOfOptions = (options: readonly Option[]): NamesOf => {
  const names = new Map(options.map((option) => [option.canonicalName, option.aliases] as const));
  return (canonicalName) => names.get(canonicalName) ?? [canonicalName];
};

/**
 * What a value takes, as a Fig argument: files or folders, suggested values, optional, several. A file or
 * folder of declared formats gets BioPilot's project-aware generator; without formats, the engine's templates.
 */
const valueArg = (value: ValueSpec, name: string, description: string | undefined, files: FileValueContext): Fig.Arg => ({
  name,
  ...(description ? { description } : {}),
  isOptional: value.optional,
  isVariadic: value.multiple,
  ...((value.type === "file" || value.type === "dir") && value.formats.length > 0
    ? { generators: fileGenerator(value, files, getCatalog) }
    : value.type === "file"
    ? { template: "filepaths" as const }
    : value.type === "dir"
    ? { template: "folders" as const }
    : {}),
  ...(value.values.length > 0 ? { suggestions: mapLocal(value.values, (v) => ({ name: v.value, description: v.description ?? undefined })) } : {}),
});

const valueName = (value: ValueSpec) => (value.formats.length > 0 ? value.formats.join("|") : value.type);

/** Canonical name first, so that the engine shows it and matches it first. */
const optionNames = (option: Option): string[] => [option.canonicalName, ...option.aliases.filter((alias) => alias !== option.canonicalName)];

const toFigOption = (option: Option, namesOf: NamesOf, command: Command): Fig.Option => {
  const figOption: Fig.Option = {
    name: optionNames(option),
    description: option.description ?? undefined,
    priority: option.deprecated ? DEPRECATED_PRIORITY : option.rank,
    ...(option.value
      ? { args: valueArg(option.value, valueName(option.value), undefined, { ownNames: option.aliases, namesOf, mate: option.mate, derive: option.derive }) }
      : {}),
    ...(option.repeatable ? { isRepeatable: true } : {}),
    ...(option.hidden ? { hidden: true } : {}),
  };
  optionRanking.set(figOption, {
    canonicalName: option.canonicalName,
    rules: option.rules,
    deprecated: option.deprecated,
    tool: command.tool,
    command: command.path.join(" "),
  });
  return figOption;
};

const toFigArg = (argument: Argument, namesOf: NamesOf): Fig.Arg => {
  const base = argument.value
    ? valueArg(argument.value, argument.name, argument.description ?? undefined, { ownNames: [], namesOf, mate: null, derive: null })
    : { name: argument.name, description: argument.description ?? undefined };
  return { ...base, isVariadic: argument.variadic || (argument.value?.multiple ?? false) };
};

/** What a spec is built for: the active binary's version and the User store holding its Profiles. */
type Installed = { tool: string; version: string | undefined; versionSource: VersionSource | undefined; key: string; store: UserStore | undefined };

/** A Profile option the Catalog doesn't know: the help's own description, the default rank. */
const toProfileOnlyOption = (option: HelpOption, filesForValues = false): Fig.Option => {
  const long = option.names.filter((name) => name.startsWith("--"));
  return {
    name: [...long, ...option.names.filter((name) => !name.startsWith("--"))],
    description: option.description ?? undefined,
    priority: PROFILE_ONLY_RANK,
    // A learned tool's values are unknown: most are files in bioinformatics.
    ...(option.takesValue ? { args: filesForValues ? { name: "value", template: "filepaths" as const } : { name: "value" } } : {}),
  };
};

/** A learned tool's option (its help is all BioPilot knows): ranked by usage alone (spec §6.5). */
const toLearnedOption = (option: HelpOption, tool: string, command: string): Fig.Option => {
  const figOption = toProfileOnlyOption(option, true);
  const names = typeof figOption.name === "string" ? [figOption.name] : figOption.name;
  optionRanking.set(figOption, { canonicalName: names[0], rules: [], deprecated: false, tool, command });
  return figOption;
};

/** The spec of a Learned tool from its Profiles: subcommands from its definition, options from their help. */
const toLearnedCommand = (learned: LearnedTool, installed: Installed | undefined): { spec: Fig.Subcommand; complete: boolean } => {
  let complete = installed !== undefined;
  const optionsOf = (command: string) => {
    const profile = installed?.store?.getProfile(learned.name, installed.key, command);
    if (!profile) complete = false;
    return mapLocal(profile?.options ?? [], (option) => toLearnedOption(option, learned.name, command));
  };
  const subcommands = mapLocal(learned.subcommands, (sub) => ({
    name: sub.name,
    ...(sub.description ? { description: sub.description } : {}),
    options: optionsOf(sub.name),
  }));
  return {
    spec: {
      name: learned.name,
      ...(learned.description ? { description: learned.description } : {}),
      options: optionsOf(""),
      ...(subcommands.length > 0 ? { subcommands } : {}),
    },
    complete,
  };
};

/**
 * A Command's options for the installed binary. With a Profile (non-empty), its options: those the Catalog
 * also has (by any alias) as the Catalog describes them, the others from the help; Catalog options the
 * Profile lacks are dropped. Without one, the Catalog's, filtered by version when it is known.
 */
const commandOptions = (current: Catalog, command: Command, installed: Installed | undefined): { options: Fig.Option[]; complete: boolean } => {
  const catalogOptions = current.listOptions(command);
  const namesOf = namesOfOptions(catalogOptions);
  const toOption = (option: Option) => toFigOption(option, namesOf, command);
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
          toOption,
        ),
        ...extra,
      ],
      complete: true,
    };
  }
  const version = installed?.version;
  const listed = version === undefined ? catalogOptions : catalogOptions.filter((option) => withinVersions(version, option.since, option.until));
  // A missing Profile may land later (sync, detached computation); a computed but empty one never will.
  return { options: mapLocal(listed, toOption), complete: installed === undefined || profile !== undefined };
};

const toFigCommand = (
  current: Catalog,
  command: Command,
  name: string,
  description: string | undefined,
  installed: Installed | undefined,
): { spec: Fig.Subcommand; complete: boolean } => {
  const namesOf = namesOfOptions(current.listOptions(command));
  const args = mapLocal(current.listArguments(command), (argument) => toFigArg(argument, namesOf));
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
const installedFor = (current: Catalog, tool: string, learned?: ToolQuery): { binary: Binary; installed: Installed } | undefined => {
  const binary = resolveBinary(tool, sessionEnvironment().PATH);
  const query = binary ? learned ?? current.getToolQuery(tool) : undefined;
  if (!binary || !query) return;
  const store = getUserStore();
  if (versions.get(binary.fingerprint) === undefined) {
    const fromConda = condaMetaVersion(binary, query.package);
    const probed = fromConda ? undefined : store?.probedVersion(binary.fingerprint) ?? undefined;
    versions.set(
      binary.fingerprint,
      fromConda ? { version: fromConda, source: "conda-meta" } : probed ? { version: probed, source: "version-command" } : undefined,
    );
  }
  const detected = versions.get(binary.fingerprint);
  const version = detected?.version;
  return { binary, installed: { tool, version, versionSource: detected?.source, key: versionKey(version, binary.fingerprint), store } };
};

/** Priority of a Catalog Tool's name in command-name completion (spec M6): above other specs (40). */
const TOOL_PRIORITY = 90;
/** M6: fixed bonus of a Tool whose platform is among the project's. */
const PLATFORM_BONUS = 5;

type ListedTool = { name: string; description: string | undefined; platforms: readonly string[] };
let tools: ListedTool[] | undefined;
/**
 * The Catalog's Tools for command-name completion (spec M6), with their priority in the project around
 * `cwd`; empty when the Catalog is unavailable.
 */
export const catalogTools = (cwd?: string): { name: string; description: string | undefined; priority: number }[] => {
  if (tools === undefined) {
    try {
      const listed = getCatalog()?.listTools() ?? [];
      tools = mapLocal(listed, (tool) => ({ name: tool.name, description: tool.description ?? undefined, platforms: tool.platforms }));
    } catch {
      tools = [];
    }
  }
  const platforms = projectAt(cwd)?.platforms ?? [];
  // Learned tools too, read each time: one may have been learned during the session.
  const known = new Set(tools.map((tool) => tool.name));
  const learned = (getUserStore()?.listLearnedTools() ?? []).filter((tool) => !known.has(tool.name));
  return [
    ...mapLocal(tools, ({ name, description, platforms: own }) => ({
      name,
      description,
      priority: TOOL_PRIORITY + (own.some((platform) => (platforms as readonly string[]).includes(platform)) ? PLATFORM_BONUS : 0),
    })),
    ...mapLocal(learned, (tool) => ({ name: tool.name, description: tool.description ?? undefined, priority: TOOL_PRIORITY })),
  ];
};

/**
 * The spec of a Catalog Tool for the binary the shell would run, or nothing when the Tool isn't in the
 * Catalog or the Catalog is unavailable. Never throws; rebuilt only when the binary, its version or its
 * Profiles change.
 */
export const catalogSpec = (toolName: string): Fig.Subcommand | undefined => {
  const cached = specs.get(toolName);
  const now = Date.now();
  // Neither a Catalog Tool nor a learned one: asked again only now and then (it may be learned meanwhile).
  if (cached?.spec === null && now - cached.checkedAt < UNKNOWN_RECHECK_MS) return undefined;
  try {
    const current = getCatalog();
    const tool = current?.getTool(toolName);
    const root = tool ? current?.getCommand(tool.name) : undefined;
    const learned = current && !tool ? getUserStore()?.getLearnedTool(toolName) : undefined;
    if (!current || ((!tool || !root) && !learned)) {
      specs.set(toolName, { key: "", spec: null, checkedAt: now });
      return undefined;
    }
    const name = tool?.name ?? toolName;
    const found = installedFor(current, name, learned?.query);
    const key = found ? `${found.binary.fingerprint}\0${found.installed.key}` : "";
    if (cached && cached.spec !== null && cached.key === key && (cached.checkedAt === Infinity || now - cached.checkedAt < PROFILE_RECHECK_MS))
      return cached.spec ?? undefined;
    const built = learned ? toLearnedCommand(learned, found?.installed) : toFigCommand(current, root!, name, tool?.description ?? undefined, found?.installed);
    specs.set(toolName, { key, spec: built.spec, checkedAt: built.complete ? Infinity : now });
    detections.set(toolName, {
      installed: found !== undefined,
      version: found?.installed.version,
      versionSource: found?.installed.versionSource,
      profilesPending: found !== undefined && !built.complete,
    });
    // A Profile is missing: computed aside (once per binary per session); a later suggestion picks it up.
    if (found && !built.complete) requestProfile(name, found.binary, sessionEnvironment().PATH);
    return built.spec;
  } catch {
    return cached?.spec ?? undefined; // fail silently: the engine falls back to what it had, or to Fig
  }
};
