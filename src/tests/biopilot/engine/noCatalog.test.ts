// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Without a usable Catalog, the engine behaves exactly as before (spec principle "fail silently").

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Shell } from "../../../utils/shell.js";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  const corrupt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-")), "knowledge.db");
  fs.writeFileSync(corrupt, "not a database");
  process.env.BIOPILOT_CATALOG = corrupt;
  runtime = await import("../../../runtime/runtime.js");
});

test("a Catalog tool gets no BioPilot suggestions, and nothing throws", async () => {
  await expect(runtime.getSuggestions("fastp --", os.tmpdir(), Shell.Bash)).resolves.toBeUndefined();
});

test("command names are completed as before", async () => {
  const suggestions = (await runtime.getSuggestions("sam", os.tmpdir(), Shell.Bash))?.suggestions ?? [];
  expect(suggestions.map((s) => s.name)).not.toContain("samtools");
});
