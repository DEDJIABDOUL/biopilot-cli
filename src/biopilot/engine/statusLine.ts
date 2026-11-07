// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// M7: the status line under the suggestions of a Catalog Tool — what BioPilot detected for it (version,
// where the version came from, conda environment) and a warning when relevant. Built from what the last
// suggestion resolved: no extra I/O on a keystroke.

import path from "node:path";
import { sessionEnvironment } from "../env/session.js";
import { detectionOf } from "./catalogSpec.js";

const SOURCE_TEXT = { "conda-meta": "conda-meta", "version-command": "version command" } as const;

/** The status line for a typed line, or nothing when its first word is not a Catalog Tool already looked up. */
export const statusLineFor = (line: string): string | undefined => {
  const tool = line.trimStart().split(/\s+/, 1)[0];
  const detection = tool ? detectionOf(tool) : undefined;
  if (!tool || !detection) return;
  if (!detection.installed) return `${tool} · not installed: options from the Catalog`;
  const environment = sessionEnvironment().CONDA_PREFIX;
  const parts = [
    detection.version ? `${tool} ${detection.version}` : `${tool} (version unknown)`,
    ...(detection.versionSource ? [SOURCE_TEXT[detection.versionSource]] : []),
    ...(environment ? [`env ${path.basename(environment)}`] : []),
    ...(detection.profilesPending ? ["reading its real options…"] : []),
  ];
  return parts.join(" · ");
};
