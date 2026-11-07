// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot uninstall` (spec §9, §10.2): leaves the system as it was. Removes the configuration, the data
// folder (resources, Catalog, User store: Profiles and usage), the `biopilot init` lines of the shell
// startup files, and the standalone binary when BioPilot runs as one. Shows everything first.

import fs from "node:fs";
import path from "node:path";
import { resolveXdgConfigHome, resolveXdgDataHome } from "../../utils/constants.js";

const FOLDER = "biopilot";
/** Startup files `biopilot init` asks the user to edit. */
const SHELL_FILES = [".bashrc", ".zshrc", path.join(".config", "fish", "config.fish")];
/** A line sourcing a BioPilot init file, current (`…/biopilot/init/bash/init.sh`) or legacy (`~/.biopilot/init/…`). */
const INIT_LINE = /source\s.*[/.]biopilot\/init\/(bash|zsh|fish)\//;
/** The comment older versions of the plugin left before it. */
const PLUGIN_COMMENT = /^\s*#\s*biopilot shell plugin\s*$/;

export type UninstallPlan = {
  /** Folders and files to remove, existing ones only. */
  paths: string[];
  /** Startup files and the BioPilot lines to take out of each. */
  shellLines: { file: string; lines: string[] }[];
  /** The standalone binary to remove, when BioPilot runs as one. */
  binary: string | null;
};

/** What is BioPilot's in this home. `binary`: the standalone binary running, if any. */
export const planUninstall = ({ home, env = process.env, binary = null }: { home: string; env?: NodeJS.ProcessEnv; binary?: string | null }): UninstallPlan => {
  const configHome = resolveXdgConfigHome(env.XDG_CONFIG_HOME, process.platform) ?? path.join(home, ".config");
  const dataHome = resolveXdgDataHome(env.XDG_DATA_HOME, home, process.platform) ?? path.join(home, ".local", "share");
  const candidates = [
    path.join(configHome, FOLDER),
    path.join(home, ".biopilotrc"),
    path.join(dataHome, FOLDER),
    path.join(home, `.${FOLDER}`), // legacy data folder
  ];
  const shellLines = SHELL_FILES.flatMap((relative) => {
    const file = path.join(home, relative);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf-8");
    } catch {
      return [];
    }
    const lines = text.split("\n").filter((line) => INIT_LINE.test(line) || PLUGIN_COMMENT.test(line));
    return lines.length > 0 ? [{ file, lines }] : [];
  });
  return {
    paths: [...new Set(candidates)].filter((candidate) => fs.existsSync(candidate)),
    shellLines,
    binary: binary && fs.existsSync(binary) ? binary : null,
  };
};

export const isEmptyPlan = (plan: UninstallPlan): boolean => plan.paths.length === 0 && plan.shellLines.length === 0 && plan.binary === null;

/** Removes what the plan lists; startup files keep every other line exactly as it was. */
export const applyUninstall = (plan: UninstallPlan): void => {
  for (const { file, lines } of plan.shellLines) {
    const remove = new Set(lines);
    const kept = fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter((line) => !remove.has(line));
    fs.writeFileSync(file, kept.join("\n"));
  }
  for (const target of plan.paths) fs.rmSync(target, { recursive: true, force: true });
  if (plan.binary) fs.rmSync(plan.binary, { force: true });
};

/** The plan, as shown before removing anything. */
export const describePlan = (plan: UninstallPlan): string =>
  [
    ...plan.paths.map((target) => `  remove ${target}`),
    ...plan.shellLines.flatMap(({ file, lines }) => lines.map((line) => `  remove from ${file}: ${line.trim()}`)),
    ...(plan.binary ? [`  remove ${plan.binary}`] : []),
  ].join("\n");
