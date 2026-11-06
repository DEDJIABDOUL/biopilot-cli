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

  describe("query time: typical reader lookups < 2 ms (enforced by `npm run perf:catalog`, run alone in CI)", () => {
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
  });
});
