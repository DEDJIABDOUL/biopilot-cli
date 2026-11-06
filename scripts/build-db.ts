// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run build:db`: compiles knowledge/tools/*.yml into build/knowledge.db.
// Usage: tsx scripts/build-db.ts [sourcesDir] [outputPath] [formatsPath]

import fs from "node:fs";
import path from "node:path";
import { compileCatalog } from "../src/biopilot/knowledge/compile.js";

const sourcesDir = path.resolve(process.argv[2] ?? path.join("knowledge", "tools"));
const outputPath = path.resolve(process.argv[3] ?? path.join("build", "knowledge.db"));
const formatsPath = path.resolve(process.argv[4] ?? path.join("knowledge", "formats.yml"));
const biopilotVersion = JSON.parse(fs.readFileSync("package.json", "utf-8")).version as string;

const result = compileCatalog({ sourcesDir, formatsPath, outputPath, biopilotVersion });
if (!result.ok) {
  process.stderr.write(`Catalog build failed: ${result.errors.length} error(s)\n`);
  for (const error of result.errors) {
    const file = path.relative(process.cwd(), path.resolve(sourcesDir, error.file));
    process.stderr.write(`  ${file}${error.line ? `:${error.line}` : ""} › ${error.location}: ${error.message}\n`);
  }
  process.exit(1);
}
process.stdout.write(`Catalog built: ${result.toolCount} tool(s) → ${path.relative(process.cwd(), outputPath)}\n`);
