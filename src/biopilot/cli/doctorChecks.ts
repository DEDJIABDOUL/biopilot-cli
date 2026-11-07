// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot doctor`'s BioPilot checks, loaded only when doctor runs (SQLite stays out of startup): the Catalog, the User store, the standalone binary's folder on PATH,
// and the active environment with the Catalog Tools found in it. Only errors count in doctor's exit code.

import fs from "node:fs";
import path from "node:path";
import { resolveBinary } from "../env/resolver.js";
import { openCatalog } from "../knowledge/catalog.js";
import { openUserStore } from "../profile/userStore.js";

export type Check = { level: "ok" | "warning" | "error"; text: string; hint?: string };

export type InstallationContext = {
  env: NodeJS.ProcessEnv;
  /** Explicit Catalog file; the standard locations when omitted. */
  catalogPath?: string;
  userStoreFile: string;
  /** The standalone binary running, if BioPilot runs as one. */
  standaloneBinary: string | null;
};

export const installationChecks = ({ env, catalogPath, userStoreFile, standaloneBinary }: InstallationContext): Check[] => {
  const checks: Check[] = [];
  const opened = openCatalog(catalogPath);
  let tools: string[] = [];
  if (!opened.available) {
    checks.push({ level: "error", text: `the Catalog is unavailable: ${opened.detail}`, hint: "run biopilot reinit to reinstall it" });
  } else {
    tools = opened.catalog.listTools().map((tool) => tool.name);
    checks.push({
      level: "ok",
      text: `Catalog available (${tools.length} ${tools.length === 1 ? "tool" : "tools"}, schema ${opened.catalog.schemaVersion}, ${opened.catalog.path})`,
    });
    opened.catalog.close();
  }

  if (!fs.existsSync(userStoreFile)) checks.push({ level: "ok", text: `no User store yet (${userStoreFile}): it is created on first use` });
  else {
    const store = openUserStore({ create: false, file: userStoreFile });
    if (store) {
      store.close();
      checks.push({ level: "ok", text: `User store readable (${userStoreFile})` });
    } else {
      checks.push({
        level: "error",
        text: `the User store ${userStoreFile} cannot be read`,
        hint: "remove it (Profiles and usage are rebuilt as you go)",
      });
    }
  }

  if (standaloneBinary) {
    const folder = path.dirname(standaloneBinary);
    const onPath = (env.PATH ?? "").split(path.delimiter).some((dir) => path.resolve(dir) === folder);
    if (!onPath) checks.push({ level: "warning", text: `${folder} is not on your PATH`, hint: `add it: export PATH="${folder}:$PATH"` });
  }

  const found = tools.filter((tool) => resolveBinary(tool, env.PATH) !== undefined);
  const where = env.CONDA_PREFIX
    ? `environment ${env.CONDA_DEFAULT_ENV || path.basename(env.CONDA_PREFIX)} (${env.CONDA_PREFIX})`
    : "no conda environment active";
  checks.push({
    level: "ok",
    text: `${where}: ${found.length} of ${tools.length} Catalog tools installed${found.length > 0 ? ` (${found.join(", ")})` : ""}`,
  });
  return checks;
};
