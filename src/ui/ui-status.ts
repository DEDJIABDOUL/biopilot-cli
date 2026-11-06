// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import chalk from "chalk";

export const renderConfirmation = (live: boolean): string => {
  const statusMessage = live ? chalk.green("live") : chalk.red("not found");
  return `biopilot session [${statusMessage}]\n`;
};

export const renderMissingResources = (): string => {
  return chalk.red(`biopilot resources out of date, run "biopilot reinit" to refresh\n`);
};
