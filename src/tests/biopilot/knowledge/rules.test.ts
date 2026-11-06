// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import { openCatalog, type Catalog, type Command } from "../../../biopilot/knowledge/catalog.js";
import { ruleHolds, type RuleContext } from "../../../biopilot/knowledge/rules.js";
import { RULED, compileValid } from "../helpers.js";

describe("Catalog reader: context rules", () => {
  let catalog: Catalog;
  let root: Command;
  beforeAll(() => {
    const opened = openCatalog(compileValid({ "ruled.yml": RULED }));
    if (!opened.available) throw new Error(opened.detail);
    catalog = opened.catalog;
    root = catalog.getCommand("ruled")!;
  });
  afterAll(() => catalog.close());

  test("rules come back structured, with options used named canonically", () => {
    expect(catalog.findOption(root, "-I")?.rules).toEqual([{ when: { used: ["--in1"], paired: true, platform: null, assay: null }, boost: 35 }]);
  });

  test("an option keeps its rules in order; boosts may be negative; no rule means an empty list", () => {
    expect(catalog.findOption(root, "--nanopore-mode")?.rules.map((rule) => [rule.when.platform, rule.boost])).toEqual([
      ["nanopore", 40],
      ["illumina", -30],
    ]);
    expect(catalog.findOption(root, "--in1")?.rules).toEqual([]);
  });

  test("an empty condition is kept as a rule with no constraint", () => {
    expect(catalog.findOption(root, "--quant")?.rules).toEqual([
      { when: { used: [], paired: null, platform: null, assay: "rna-seq" }, boost: 20 },
      { when: { used: [], paired: null, platform: null, assay: null }, boost: 5 },
    ]);
  });
});

describe("when a rule holds", () => {
  const none = { used: [], paired: null, platform: null, assay: null };
  const context: RuleContext = { used: ["--in1"], paired: true, platforms: ["illumina", "nanopore"], assay: "rna-seq" };

  test("an empty condition always holds", () => {
    expect(ruleHolds(none, context)).toBe(true);
    expect(ruleHolds(none, { used: [], paired: false, platforms: [], assay: "unknown" })).toBe(true);
  });

  test("used: every listed option must already be on the command line", () => {
    expect(ruleHolds({ ...none, used: ["--in1"] }, context)).toBe(true);
    expect(ruleHolds({ ...none, used: ["--in1", "--out1"] }, context)).toBe(false);
  });

  test("paired: must match the project", () => {
    expect(ruleHolds({ ...none, paired: true }, context)).toBe(true);
    expect(ruleHolds({ ...none, paired: false }, context)).toBe(false);
  });

  test("platform: holds when the project's platforms contain it (a hybrid project has both)", () => {
    expect(ruleHolds({ ...none, platform: "nanopore" }, context)).toBe(true);
    expect(ruleHolds({ ...none, platform: "illumina" }, context)).toBe(true);
    expect(ruleHolds({ ...none, platform: "nanopore" }, { ...context, platforms: ["illumina"] })).toBe(false);
    expect(ruleHolds({ ...none, platform: "illumina" }, { ...context, platforms: [] })).toBe(false);
  });

  test("assay: must match the project", () => {
    expect(ruleHolds({ ...none, assay: "rna-seq" }, context)).toBe(true);
    expect(ruleHolds({ ...none, assay: "variant-calling" }, context)).toBe(false);
  });

  test("every given field must hold", () => {
    expect(ruleHolds({ used: ["--in1"], paired: true, platform: null, assay: null }, context)).toBe(true);
    expect(ruleHolds({ used: ["--in1"], paired: true, platform: null, assay: null }, { ...context, paired: false })).toBe(false);
  });
});
