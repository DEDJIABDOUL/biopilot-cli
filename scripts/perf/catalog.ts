// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run perf:catalog`: checks the Catalog compiled from knowledge/ against the spec §11 budgets.
// Compiles it twice into a temporary folder (the bytes must match), then reports its size against the
// scaled size budget and the median time of each typical reader lookup. Exits 1 if any check fails.
// Usage: tsx scripts/perf/catalog.ts [samples]   (default 1000, or BIOPILOT_PERF_ITERATIONS)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LOOKUP_BUDGET_MS, catalogSizeBudget, timeLookups } from "../../src/biopilot/knowledge/budget.js";
import { openCatalog } from "../../src/biopilot/knowledge/catalog.js";
import { compileCatalog } from "../../src/biopilot/knowledge/compile.js";

const samples = Number.parseInt(process.argv[2] ?? process.env.BIOPILOT_PERF_ITERATIONS ?? "1000", 10);
const sourcesDir = path.resolve("knowledge", "tools");
const formatsPath = path.resolve("knowledge", "formats.yml");
const biopilotVersion = JSON.parse(fs.readFileSync("package.json", "utf-8")).version as string;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-perf-"));

const failures: string[] = [];
try {
  const build = (name: string) => {
    const outputPath = path.join(workDir, name);
    const result = compileCatalog({ sourcesDir, formatsPath, outputPath, biopilotVersion });
    if (!result.ok) throw new Error(`Catalog build failed: ${result.errors.map((error) => `${error.file} › ${error.location}: ${error.message}`).join("; ")}`);
    return { outputPath, toolCount: result.toolCount };
  };
  const first = build("first.db");
  const second = build("second.db");

  const reproducible = fs.readFileSync(first.outputPath).equals(fs.readFileSync(second.outputPath));
  if (!reproducible) failures.push("two builds of the same sources differ");

  const size = fs.statSync(first.outputPath).size;
  const budget = catalogSizeBudget(first.toolCount);
  if (size >= budget) failures.push(`size ${size} B is over the budget of ${budget} B`);

  const opened = openCatalog(first.outputPath);
  if (!opened.available) throw new Error(`Catalog unavailable: ${opened.detail}`);
  const timings = timeLookups(opened.catalog, samples);
  opened.catalog.close();
  for (const timing of timings)
    if (timing.medianMs >= LOOKUP_BUDGET_MS) failures.push(`${timing.name} median ${timing.medianMs.toFixed(3)} ms is over ${LOOKUP_BUDGET_MS} ms`);

  process.stdout.write(
    `${JSON.stringify(
      {
        tools: first.toolCount,
        reproducible,
        size: { bytes: size, budgetBytes: budget, percentOfBudget: Number(((100 * size) / budget).toFixed(1)) },
        lookups: timings.map((timing) => ({ ...timing, medianMs: Number(timing.medianMs.toFixed(4)), p95Ms: Number(timing.p95Ms.toFixed(4)) })),
        budgetMs: LOOKUP_BUDGET_MS,
        failures,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
if (failures.length > 0) process.exit(1);
