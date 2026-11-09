// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot check [--json] "<command line>"` (ticket #109): the Warnings of a command line,
// before it runs. Exit code 0 without a warning, 1 with at least one, 2 when the line cannot be analysed.

import fs from "node:fs";
import { checkLine, type CheckContext } from "../check/check.js";
import { availableCpus } from "../check/cpus.js";
import { openCatalog } from "../knowledge/catalog.js";
import type { StatusIO } from "./statusRunner.js";

/** Version of the `--json` output contract (schemas/check-output.schema.json). */
export const CHECK_JSON_FORMAT = 1;
const USAGE = 'usage: biopilot check [--json] "<command line>"\n';

export const EXIT_NO_WARNING = 0;
export const EXIT_WARNINGS = 1;
export const EXIT_NOT_ANALYSED = 2;

/** The real file system and CPUs, for a command line typed in `cwd`. */
export const checkContext = (cwd: string, env: NodeJS.ProcessEnv): CheckContext => ({
  cwd,
  home: env.HOME,
  exists: (file) => fs.existsSync(file),
  isDirectory: (file) => {
    try {
      return fs.statSync(file).isDirectory();
    } catch {
      return false;
    }
  },
  list: (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  },
  cpus: availableCpus(env),
});

export const runCheck = async (args: readonly string[], io: StatusIO, context?: CheckContext): Promise<number> => {
  let json = false;
  const words: string[] = [];
  for (const arg of args) {
    if (arg === "--json" && words.length === 0) json = true;
    else words.push(arg);
  }
  // One quoted argument is the line; several words are joined, for `biopilot check -- fastp -i x`.
  const line = (words[0] === "--" ? words.slice(1) : words).join(" ").trim();
  if (line === "") {
    io.stderr(`biopilot: give the command line to check\n${USAGE}`);
    return EXIT_NOT_ANALYSED;
  }
  const opened = openCatalog();
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return EXIT_NOT_ANALYSED;
  }
  let result;
  try {
    result = checkLine(line, opened.catalog, context ?? checkContext(io.cwd, io.env));
  } catch {
    result = { ok: false as const, reason: "the line could not be analysed" };
  } finally {
    opened.catalog.close();
  }
  if (!result.ok) {
    if (json)
      io.stdout(JSON.stringify({ format: CHECK_JSON_FORMAT, line, analysed: false, reason: result.reason, commands: [], warnings: [] }, null, 2) + "\n");
    else io.stderr(`biopilot: cannot check this line: ${result.reason}\n`);
    return EXIT_NOT_ANALYSED;
  }
  const failing = result.warnings.some((warning) => warning.severity === "warning");
  if (json) {
    io.stdout(JSON.stringify({ format: CHECK_JSON_FORMAT, line, analysed: true, commands: result.analysed, warnings: result.warnings }, null, 2) + "\n");
  } else if (result.warnings.length === 0) {
    io.stdout(`no warning (${result.analysed.map((c) => [c.tool, ...c.command].join(" ")).join(", ")})\n`);
  } else {
    for (const warning of result.warnings) io.stdout(`${warning.severity === "warning" ? "⚠" : "ℹ"} ${warning.message}  [${warning.rule}]\n`);
  }
  return failing ? EXIT_WARNINGS : EXIT_NO_WARNING;
};
