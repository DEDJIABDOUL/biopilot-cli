// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run perf:catalog` is where the §11 budgets are enforced (CI runs it alone, so timings are not
// disturbed by parallel tests). These tests only check that it fails when a budget is exceeded, by
// forcing budgets no Catalog can meet: they never depend on the speed of the machine.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const perfCatalog = (env: Record<string, string>) => {
  const run = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "scripts", "perf", "catalog.ts"), "5"], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  return {
    code: run.status,
    report: JSON.parse(run.stdout) as {
      scenarios: { name: string }[];
      suggestions: { cold: { medianMs: number }; warm: { name: string }[] };
      failures: string[];
    },
  };
};

jest.setTimeout(120_000);

describe("npm run perf:catalog", () => {
  test("checks the repository's Catalog, a 50-tool Catalog and a 150-option command", () => {
    const { report } = perfCatalog({ BIOPILOT_LOOKUP_BUDGET_MS: "1e-9" });
    expect(report.scenarios.map((scenario) => scenario.name)).toEqual(["repository", "50 typical tools", "150-option command"]);
  });

  test("exits 1 and names the lookup when a lookup is over budget", () => {
    const { code, report } = perfCatalog({ BIOPILOT_LOOKUP_BUDGET_MS: "1e-9" });
    expect(code).toBe(1);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^150-option command: listOptions median .* over 1e-9 ms$/)]));
  });

  test("exits 1 and gives the size when the Catalog is over its size budget", () => {
    const { code, report } = perfCatalog({ BIOPILOT_SIZE_BUDGET_BYTES: "1" });
    expect(code).toBe(1);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^repository: size \d+ B is over the budget of 1 B$/)]));
  });

  test("measures the cold first suggestion and warm suggestions of Catalog tools", () => {
    const { report } = perfCatalog({ BIOPILOT_LOOKUP_BUDGET_MS: "1e-9" });
    expect(report.suggestions.cold.medianMs).toBeGreaterThan(0);
    expect(report.suggestions.warm.map((timing) => timing.name)).toEqual(["fastp --", "fastp -i r1.fq --", "samtools sort -"]);
  });

  test("exits 1 and names the line when the cold first suggestion is over budget", () => {
    const { code, report } = perfCatalog({ BIOPILOT_COLD_SUGGESTION_BUDGET_MS: "1e-9" });
    expect(code).toBe(1);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^suggestions: cold `fastp --` median .* over 1e-9 ms$/)]));
  });

  test("exits 1 and names the line when a warm suggestion is over budget", () => {
    const { code, report } = perfCatalog({ BIOPILOT_WARM_SUGGESTION_BUDGET_MS: "1e-9" });
    expect(code).toBe(1);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^suggestions: warm `samtools sort -` median .* over 1e-9 ms$/)]));
  });
});
