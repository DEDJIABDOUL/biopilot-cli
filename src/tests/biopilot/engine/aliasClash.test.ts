// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// A shell alias named like a Catalog tool: the alias wins (aliases come first), the tool isn't listed twice.

import { jest } from "@jest/globals";
import os from "node:os";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools } from "../helpers.js";

// The user's shell aliases are outside BioPilot: stand in for them.
jest.unstable_mockModule("../../../runtime/alias.js", () => ({
  getAliasNames: () => ["samtools"],
  aliasExpand: <T>(tokens: T) => tokens,
  loadAliases: async () => undefined,
}));

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  runtime = await import("../../../runtime/runtime.js");
});

test("an alias named like a Catalog tool is listed once, as the alias", async () => {
  const suggestions = (await runtime.getSuggestions("sam", os.tmpdir(), Shell.Bash))?.suggestions ?? [];
  const samtools = suggestions.filter((s) => s.name === "samtools");
  expect(samtools).toHaveLength(1);
  expect(samtools[0].type).toBe("shortcut");
});
