// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import chalk from "chalk";
import { unpackResources } from "../utils/node.js";
import { createShellConfigs } from "../utils/shell.js";
import { allResourcesPath, getResourcePaths, preferredResourcesPath } from "../utils/constants.js";
import fs from "node:fs";
// BIOPILOT: M10 reinit replaces the Catalog and keeps the User store.
import { moveUserStore, removeCatalog } from "../biopilot/resources.js";

const removeResources = (resourcesPath: string) => {
  const resources = getResourcePaths(resourcesPath);
  fs.rmSync(resources.shell, { recursive: true, force: true });
  fs.rmSync(resources.native, { recursive: true, force: true });
  fs.rmSync(resources.logging, { recursive: true, force: true });
  fs.rmSync(resources.init, { recursive: true, force: true });
  fs.rmSync(resources.spec, { recursive: true, force: true });
  fs.rmSync(resources.version, { force: true });
  removeCatalog(resourcesPath); // BIOPILOT: M10
};

export const render = async () => {
  if (allResourcesPath !== preferredResourcesPath) moveUserStore(allResourcesPath, preferredResourcesPath); // BIOPILOT: M10
  if (allResourcesPath !== preferredResourcesPath) fs.rmSync(allResourcesPath, { recursive: true, force: true });
  removeResources(preferredResourcesPath);
  process.stdout.write(chalk.green("✓") + " removed old biopilot resources \n");

  const preferredResources = getResourcePaths(preferredResourcesPath);
  await createShellConfigs(preferredResources.init);
  await unpackResources(preferredResourcesPath);

  process.stdout.write(chalk.green("✓") + " successfully installed biopilot \n");
};
