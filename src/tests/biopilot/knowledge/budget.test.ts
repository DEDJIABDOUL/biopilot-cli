// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Performance budgets of the Catalog (spec §11, ticket #9): file size and reader lookup time.

import fs from "node:fs";
import { CATALOG_SIZE_BUDGET, LOOKUP_BUDGET_MS, catalogSizeBudget, timeLookups } from "../../../biopilot/knowledge/budget.js";
import { openCatalog, type Catalog } from "../../../biopilot/knowledge/catalog.js";
import { compileRepositoryCatalog, compileValid } from "../helpers.js";

const open = (catalogPath: string): Catalog => {
  const opened = openCatalog(catalogPath);
  if (!opened.available) throw new Error(opened.detail);
  return opened.catalog;
};

/**
 * A typical tool: 30 options on the root command, 3 subcommands of 15. Fifty of them is the spec's reference
 * size; a lookup that scans every option of every tool (a missing index) is then far over budget.
 */
const syntheticTool = (name: string) => {
  const options = (prefix: string, count: number, indent: string) =>
    Array.from(
      { length: count },
      (_, i) => `${indent}- names: ["--${name}-${prefix}${i}"]
${indent}  description: sets ${prefix} parameter ${i} of ${name}
${indent}  value: { type: ${i % 3 === 0 ? "file" : "int"}${i % 3 === 0 ? ", format: fastq" : ""} }
${indent}  rank: ${(i * 7) % 100}`,
    ).join("\n");
  const commands = ["sort", "index", "view"].map((sub) => `  - name: ${sub}\n    options:\n${options(sub, 15, "      ")}`).join("\n");
  return `name: ${name}
version: { args: ["--version"], regex: 'v(\\S+)' }
options:
${options("root", 30, "  ")}
commands:
${commands}
`;
};

describe("Catalog budgets", () => {
  describe("size: < 5 MB for 50 tools, scaled to the tool count", () => {
    test("the budget is 5 MB for 50 tools, i.e. 100 kB per tool", () => {
      expect(CATALOG_SIZE_BUDGET).toEqual({ bytes: 5_000_000, tools: 50 });
      expect(catalogSizeBudget(50)).toBe(5_000_000);
      expect(catalogSizeBudget(1)).toBe(100_000);
      expect(catalogSizeBudget(12)).toBe(1_200_000);
    });

    test("an empty Catalog still gets the budget of one tool", () => {
      expect(catalogSizeBudget(0)).toBe(100_000);
    });

    test("the repository's own Catalog fits the budget of its tool count", () => {
      const { catalogPath, toolCount } = compileRepositoryCatalog();
      const size = fs.statSync(catalogPath).size;
      expect(toolCount).toBeGreaterThan(0);
      expect(size).toBeLessThan(catalogSizeBudget(toolCount));
    });
  });

  describe("query time: typical reader lookups < 2 ms (median, so that CI noise does not fail the check)", () => {
    test("the budget is 2 ms", () => {
      expect(LOOKUP_BUDGET_MS).toBe(2);
    });

    test("times each typical lookup of the reader", () => {
      const catalog = open(compileRepositoryCatalog().catalogPath);
      try {
        const timings = timeLookups(catalog, 20);
        expect(timings.map((timing) => timing.name)).toEqual(["getCommand", "listOptions", "findOption", "formatOfFile", "searchOptions"]);
        for (const timing of timings) {
          expect(timing.samples).toBe(20);
          expect(timing.medianMs).toBeGreaterThanOrEqual(0);
          expect(timing.p95Ms).toBeGreaterThanOrEqual(timing.medianMs);
        }
      } finally {
        catalog.close();
      }
    });

    test("an empty Catalog has nothing to time and does not throw", () => {
      const catalog = open(compileValid({}));
      try {
        expect(timeLookups(catalog, 5).map((timing) => timing.name)).toEqual(["formatOfFile", "searchOptions"]);
      } finally {
        catalog.close();
      }
    });

    test.each([
      ["the repository's own Catalog", () => compileRepositoryCatalog().catalogPath],
      [
        "a synthetic Catalog of 50 typical tools",
        () => compileValid(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`t${i}.yml`, syntheticTool(`tool${i}`)]))),
      ],
    ])("%s: every lookup is under budget", (_, build) => {
      const catalog = open(build());
      try {
        const over = timeLookups(catalog, 500).filter((timing) => timing.medianMs >= LOOKUP_BUDGET_MS);
        expect(over).toEqual([]);
      } finally {
        catalog.close();
      }
    });
  });
});
