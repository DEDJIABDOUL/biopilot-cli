// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot status`, loaded on demand by the command (see status.ts).

import chalk from "chalk";
import { resolveBinary } from "../env/resolver.js";
import { detectVersion } from "../env/version.js";
import { openCatalog } from "../knowledge/catalog.js";
import { profilesKnown } from "../profile/compute.js";
import { detectProject } from "../project/detect.js";
import { openUserStore } from "../profile/userStore.js";

/** Version of the `--json` output contract. */
export const STATUS_JSON_FORMAT = 1;

export type StatusIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** The shell's environment: `PATH`, `CONDA_PREFIX`, `CONDA_DEFAULT_ENV`. */
  env: NodeJS.ProcessEnv;
  /** The folder the project is detected from. */
  cwd: string;
};

type ToolStatus = {
  name: string;
  installed: boolean;
  binary: string | null;
  fingerprint: string | null;
  version: string | null;
  versionSource: "conda-meta" | "version-command" | null;
  /** Whether the Profiles of this binary's version are in the User store; `null` when not installed. */
  profile: "known" | "unknown" | null;
};

const SOURCE_TEXT = { "conda-meta": "conda-meta", "version-command": "version command" } as const;

export const runStatus = async ({ json }: { json: boolean }, io: StatusIO): Promise<number> => {
  const opened = openCatalog();
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return 1;
  }
  const { catalog } = opened;
  const store = openUserStore({ create: false });
  try {
    // Versions probed side by side: a slow tool delays status by 2.5 s at most, not once per tool.
    const tools: ToolStatus[] = await Promise.all(
      catalog.listTools().map(async ({ name }) => {
        const binary = resolveBinary(name, io.env.PATH);
        const query = catalog.getToolQuery(name);
        const version = binary && query ? await detectVersion(binary, query, { probe: true }) : undefined;
        return {
          name,
          installed: binary !== undefined,
          binary: binary?.path ?? null,
          fingerprint: binary?.fingerprint ?? null,
          version: version?.version ?? null,
          versionSource: version?.source ?? null,
          profile: binary && query ? (profilesKnown(name, binary, query, store) ? "known" : "unknown") : null,
        };
      }),
    );
    const environment = { name: io.env.CONDA_DEFAULT_ENV || null, prefix: io.env.CONDA_PREFIX || null };
    const detected = detectProject(io.cwd, catalog);
    const project = {
      root: detected.root,
      marker: detected.marker,
      platforms: detected.platforms,
      assay: detected.assay,
      readPairs: detected.pairs.length,
      config: detected.config?.file ?? null,
      truncated: detected.truncated,
    };
    if (json) {
      io.stdout(JSON.stringify({ format: STATUS_JSON_FORMAT, environment, project, tools }, null, 2) + "\n");
      return 0;
    }
    const lines = [
      environment.prefix ? `environment: ${environment.name ?? "conda"} (${environment.prefix})` : "environment: none (no conda environment active)",
      `project: ${project.root}${project.marker ? ` (${project.marker})` : " (no project marker: this folder only)"}`,
      `  platforms: ${project.platforms.length > 0 ? project.platforms.join(", ") : "generic"}, assay: ${project.assay}, read pairs: ${project.readPairs}` +
        (project.config ? `, config: ${project.config}` : "") +
        (project.truncated ? chalk.dim(" (first 2 000 entries)") : ""),
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
        const profile = (tool.profile === "known" ? "profile" : chalk.dim("no profile")).padEnd(10);
        lines.push(`${name}  ${version}  ${source}  ${profile}  ${tool.binary}`);
      }
    }
    io.stdout(lines.join("\n") + "\n");
    return 0;
  } finally {
    store?.close();
    catalog.close();
  }
};
