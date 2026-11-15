// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot create <project>`: prints the line that lays out a standard bioinformatics project and enters
// it. The layout itself makes the folder a project (project/layout.ts): no hidden file. It creates nothing
// itself: the line is the user's to read, edit and run (`eval "$(biopilot create x)"`).

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

export type CreateIo = { stdout: (text: string) => void; stderr: (text: string) => void };

/** Exit code 0 with the line on stdout; 2 when the name is missing, extra or not usable. */
export const runCreate = (args: string[], io: CreateIo): number => {
  if (args.length !== 1) {
    io.stderr("usage: biopilot create <project>\n");
    return 2;
  }
  const result = createLine(args[0]);
  if (!result.ok) {
    io.stderr(result.error);
    return 2;
  }
  io.stdout(result.line);
  return 0;
};
