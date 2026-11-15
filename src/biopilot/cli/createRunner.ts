// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create <project>`: creates the folders of a standard bioinformatics project, then says how to
// enter it (a program cannot change its shell's folder). The layout itself makes the folder a project
// (project/layout.ts): no hidden file. `--print` prints the `mkdir -p … && cd …` line instead, creating
// nothing, for `eval "$(biopilot create --print x)"` and scripts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROJECT_FOLDERS } from "../project/layout.js";

/** Path segments written without quotes in every shell (bash, zsh, fish). */
const SEGMENT = /^[A-Za-z0-9_+][A-Za-z0-9._+-]*$/;

export type CreateResult = { ok: true; line: string } | { ok: false; error: string };

/** The `mkdir -p … && cd …` line for a project named `name`, a folder name or a path (`~/projects/rnaseq-2026`). */
export const createLine = (name: string): CreateResult => {
  const trimmed = name.replace(/\/+$/, "");
  const home = trimmed.startsWith("~/");
  const absolute = !home && trimmed.startsWith("/");
  const segments = (home ? trimmed.slice(2) : absolute ? trimmed.slice(1) : trimmed).split("/");
  const valid = trimmed.length > 0 && segments.every((segment) => segment === ".." || SEGMENT.test(segment));
  if (!valid || segments[segments.length - 1] === "..") {
    // The name is not repeated: it may carry escape sequences meant for the terminal.
    return { ok: false, error: "biopilot: this is not a project name: use letters, digits, '.', '_', '+' and '-', not starting with '-' or '.'\n" };
  }
  const folders = PROJECT_FOLDERS.map((folder) => `${trimmed}/${folder}`).join(" ");
  return { ok: true, line: `mkdir -p ${folders} && cd ${trimmed}\n` };
};

export type CreateIo = { stdout: (text: string) => void; stderr: (text: string) => void; cwd: string };

/** The project's folder on disk: `~/` is the home folder, as the shell would read it unquoted. */
const projectPath = (name: string, cwd: string): string => {
  const trimmed = name.replace(/\/+$/, "");
  return trimmed.startsWith("~/") ? path.join(os.homedir(), trimmed.slice(2)) : path.resolve(cwd, trimmed);
};

/** Creates the missing folders of the layout; the ones created, or the error that stopped it. */
const makeLayout = (root: string): { created: string[] } | { error: string } => {
  const created: string[] = [];
  for (const folder of PROJECT_FOLDERS) {
    const target = path.join(root, folder);
    try {
      if (fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) continue;
      fs.mkdirSync(target, { recursive: true });
      created.push(folder);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const why =
        code === "EACCES" || code === "EPERM"
          ? "permission denied"
          : code === "EEXIST" || code === "ENOTDIR"
            ? "a file is in the way"
            : (code ?? "unknown error");
      return { error: `${folder}: ${why}` };
    }
  }
  return { created };
};

/**
 * Exit code 0 when the layout is there (created now or before); 1 when a folder could not be created;
 * 2 when the name is missing, extra or not usable. With `print`, only the line is written, nothing is created.
 */
export const runCreate = (args: string[], options: { print?: boolean }, io: CreateIo): number => {
  if (args.length !== 1) {
    io.stderr("usage: biopilot create [--print] <project>\n");
    return 2;
  }
  const result = createLine(args[0]);
  if (!result.ok) {
    io.stderr(result.error);
    return 2;
  }
  if (options.print) {
    io.stdout(result.line);
    return 0;
  }
  // The name passed createLine: plain characters only, safe to show.
  const name = args[0].replace(/\/+$/, "");
  const made = makeLayout(projectPath(name, io.cwd));
  if ("error" in made) {
    io.stderr(`biopilot: ${name}/${made.error}\n`);
    return 1;
  }
  if (made.created.length === 0) io.stdout(`${name}/ already has the project layout; nothing created\n`);
  else io.stdout(`created ${name}/ with ${made.created.map((folder) => `${folder}/`).join(" ")}\n`);
  io.stdout(`to enter it: cd ${name}\n`);
  return 0;
};
