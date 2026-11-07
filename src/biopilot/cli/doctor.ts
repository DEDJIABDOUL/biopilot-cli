// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot doctor`'s BioPilot section. Imported by the engine's doctor at every start of biopilot: the
// checks (and SQLite) load only when doctor actually runs.

import chalk from "chalk";
import sea from "node:sea";

/** Prints BioPilot's checks the way doctor prints its own; returns the error count. */
export const renderCatalogIssues = async (): Promise<number> => {
  const [{ installationChecks }, { userStorePath }] = await Promise.all([import("./doctorChecks.js"), import("../profile/userStore.js")]);
  const checks = installationChecks({ env: process.env, userStoreFile: userStorePath(), standaloneBinary: sea.isSea() ? process.execPath : null });
  for (const check of checks) {
    const stream = check.level === "ok" ? process.stdout : process.stderr;
    const mark = check.level === "ok" ? chalk.green("✓") : check.level === "warning" ? chalk.yellow("•") : chalk.red("•");
    stream.write(`${mark} ${check.level === "ok" ? check.text : chalk.bold(check.text)}\n`);
    if (check.hint) stream.write(chalk.yellow(`  ${check.hint}\n`));
  }
  return checks.filter((check) => check.level === "error").length;
};
