// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import chalk from "chalk";

/** `biopilot doctor` check: is the Catalog present, readable and of the expected schema? Returns the error count. */
export const renderCatalogIssues = async (): Promise<number> => {
  // Loaded on demand: SQLite stays out of session startup.
  const { openCatalog } = await import("../knowledge/catalog.js");
  const opened = openCatalog();
  if (!opened.available) {
    process.stderr.write(chalk.red("•") + chalk.bold(" the Catalog is unavailable\n"));
    process.stderr.write(`  ${opened.detail}\n`);
    process.stderr.write(chalk.yellow("  run " + chalk.underline(chalk.cyan("biopilot reinit")) + " to reinstall it\n"));
    return 1;
  }
  const { catalog } = opened;
  const toolCount = catalog.listTools().length;
  process.stdout.write(
    chalk.green("✓") + ` Catalog available (${toolCount} ${toolCount === 1 ? "tool" : "tools"}, schema ${catalog.schemaVersion}, ${catalog.path})\n`,
  );
  catalog.close();
  return 0;
};
