// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot status`, loaded on demand by the command (see status.ts).

import chalk from "chalk";
import { resolveBinary } from "../env/resolver.js";
import { detectVersion } from "../env/version.js";
import { openCatalog } from "../knowledge/catalog.js";

/** Version of the `--json` output contract. */
export const STATUS_JSON_FORMAT = 1;

export type StatusIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** The shell's environment: `PATH`, `CONDA_PREFIX`, `CONDA_DEFAULT_ENV`. */
  env: NodeJS.ProcessEnv;
};

type ToolStatus = {
  name: string;
  installed: boolean;
  binary: string | null;
  fingerprint: string | null;
  version: string | null;
  versionSource: "conda-meta" | "version-command" | null;
};

const SOURCE_TEXT = { "conda-meta": "conda-meta", "version-command": "version command" } as const;

export const runStatus = ({ json }: { json: boolean }, io: StatusIO): number => {
  const opened = openCatalog();
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return 1;
  }
  const { catalog } = opened;
  try {
    const tools: ToolStatus[] = catalog.listTools().map(({ name }) => {
      const binary = resolveBinary(name, io.env.PATH);
      const query = catalog.getToolQuery(name);
      const version = binary && query ? detectVersion(binary, query, { probe: true }) : undefined;
      return {
        name,
        installed: binary !== undefined,
        binary: binary?.path ?? null,
        fingerprint: binary?.fingerprint ?? null,
        version: version?.version ?? null,
        versionSource: version?.source ?? null,
      };
    });
    const environment = { name: io.env.CONDA_DEFAULT_ENV || null, prefix: io.env.CONDA_PREFIX || null };
    if (json) {
      io.stdout(JSON.stringify({ format: STATUS_JSON_FORMAT, environment, tools }, null, 2) + "\n");
      return 0;
    }
    const lines = [
      environment.prefix ? `environment: ${environment.name ?? "conda"} (${environment.prefix})` : "environment: none (no conda environment active)",
      "",
    ];
    const width = Math.max(0, ...tools.map((tool) => tool.name.length));
    const versionWidth = Math.max(7, ...tools.map((tool) => tool.version?.length ?? 0));
    for (const tool of tools) {
      const name = chalk.bold(tool.name.padEnd(width));
      if (!tool.installed) lines.push(`${name}  ${chalk.dim("not installed")}`);
      else {
        const version = (tool.version ?? "unknown").padEnd(versionWidth);
        const source = (tool.versionSource ? SOURCE_TEXT[tool.versionSource] : "").padEnd(15);
        lines.push(`${name}  ${version}  ${source}  ${tool.binary}`);
      }
    }
    io.stdout(lines.join("\n") + "\n");
    return 0;
  } finally {
    catalog.close();
  }
};
