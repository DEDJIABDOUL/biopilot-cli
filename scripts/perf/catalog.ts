// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run perf:catalog`: checks the Catalog against the spec §11 budgets. CI runs it on its own, after the
// tests, so that timings are not disturbed by tests running in parallel.
// Scenarios: the Catalog compiled from knowledge/ (built twice: the bytes must match; size within the scaled
// budget), a synthetic Catalog of 50 typical tools, and a 150-option command. For each, the median time of
// every typical reader lookup must stay under budget. Prints a JSON report; exits 1 if any check fails.
// Usage: tsx scripts/perf/catalog.ts [samples]   (default 1000, or BIOPILOT_PERF_ITERATIONS)
// BIOPILOT_LOOKUP_BUDGET_MS and BIOPILOT_SIZE_BUDGET_BYTES override the budgets (tests force unreachable ones).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LOOKUP_BUDGET_MS, catalogSizeBudget, timeLookups } from "../../src/biopilot/knowledge/budget.js";
import { openCatalog } from "../../src/biopilot/knowledge/catalog.js";
import { compileCatalog } from "../../src/biopilot/knowledge/compile.js";
import { fiftyTypicalTools, largeCommandTool } from "./catalogScenarios.js";

const samples = Number.parseInt(process.argv[2] ?? process.env.BIOPILOT_PERF_ITERATIONS ?? "1000", 10);
const budgetMs = process.env.BIOPILOT_LOOKUP_BUDGET_MS ? Number(process.env.BIOPILOT_LOOKUP_BUDGET_MS) : LOOKUP_BUDGET_MS;
const formatsPath = path.resolve("knowledge", "formats.yml");
const biopilotVersion = JSON.parse(fs.readFileSync("package.json", "utf-8")).version as string;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-perf-"));

const failures: string[] = [];

const build = (sourcesDir: string, name: string) => {
  const outputPath = path.join(workDir, name);
  const result = compileCatalog({ sourcesDir, formatsPath, outputPath, biopilotVersion });
  if (!result.ok) throw new Error(`Catalog build failed: ${result.errors.map((error) => `${error.file} › ${error.location}: ${error.message}`).join("; ")}`);
  return { outputPath, toolCount: result.toolCount };
};

/** Writes synthetic sources into their own folder. */
const writeSources = (name: string, files: Record<string, string>) => {
  const dir = path.join(workDir, name);
  fs.mkdirSync(dir);
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), content);
  return dir;
};

const timeScenario = (name: string, catalogPath: string) => {
  const opened = openCatalog(catalogPath);
  if (!opened.available) throw new Error(`${name}: Catalog unavailable: ${opened.detail}`);
  const timings = timeLookups(opened.catalog, samples);
  opened.catalog.close();
  for (const timing of timings)
    if (timing.medianMs >= budgetMs) failures.push(`${name}: ${timing.name} median ${timing.medianMs.toFixed(3)} ms is over ${budgetMs} ms`);
  return { name, lookups: timings.map((timing) => ({ ...timing, medianMs: Number(timing.medianMs.toFixed(4)), p95Ms: Number(timing.p95Ms.toFixed(4)) })) };
};

let report: object;
try {
  const repositorySources = path.resolve("knowledge", "tools");
  const first = build(repositorySources, "first.db");
  const second = build(repositorySources, "second.db");
  const reproducible = fs.readFileSync(first.outputPath).equals(fs.readFileSync(second.outputPath));
  if (!reproducible) failures.push("repository: two builds of the same sources differ");
  const size = fs.statSync(first.outputPath).size;
  const sizeBudget = process.env.BIOPILOT_SIZE_BUDGET_BYTES ? Number(process.env.BIOPILOT_SIZE_BUDGET_BYTES) : catalogSizeBudget(first.toolCount);
  if (size >= sizeBudget) failures.push(`repository: size ${size} B is over the budget of ${sizeBudget} B`);

  const scenarios = [
    timeScenario("repository", first.outputPath),
    timeScenario("50 typical tools", build(writeSources("fifty", fiftyTypicalTools()), "fifty.db").outputPath),
    timeScenario("150-option command", build(writeSources("large", { "large.yml": largeCommandTool() }), "large.db").outputPath),
  ];
  report = {
    tools: first.toolCount,
    reproducible,
    size: { bytes: size, budgetBytes: sizeBudget, percentOfBudget: Number(((100 * size) / sizeBudget).toFixed(1)) },
    budgetMs,
    scenarios,
    failures,
  };
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exit(1);
