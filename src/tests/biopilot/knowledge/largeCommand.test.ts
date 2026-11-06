// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// A real tool's root command can have well over a hundred options (fastp has about 100):
// listing them must stay within the spec §11 budget.

import { LOOKUP_BUDGET_MS, timeLookups } from "../../../biopilot/knowledge/budget.js";
import { openCatalog } from "../../../biopilot/knowledge/catalog.js";
import { compileValid } from "../helpers.js";

const OPTION_COUNT = 150;
const options = Array.from({ length: OPTION_COUNT }, (_, i) =>
  [
    `  - names: ["-x${i}", "--option-${i}"]`,
    `    description: option number ${i} of a large command`,
    `    value: { type: string, values: [a${i}, b${i}] }`,
    `    rank: ${i % 100}`,
    `    rules:`,
    `      - when: { used: ["-x0"], paired: true }`,
    `        boost: 10`,
  ].join("\n"),
).join("\n");
const LARGE = `name: large\nversion: { args: ["--version"], regex: 'v(\\S+)' }\noptions:\n${options}\n`;

describe("Catalog reader on a large command", () => {
  test(`lists ${OPTION_COUNT} options (aliases, values, rules) within ${LOOKUP_BUDGET_MS} ms`, () => {
    const opened = openCatalog(compileValid({ "large.yml": LARGE }));
    if (!opened.available) throw new Error(opened.detail);
    const command = opened.catalog.getCommand("large")!;
    const listed = opened.catalog.listOptions(command);
    expect(listed).toHaveLength(OPTION_COUNT);
    expect(listed[0]).toMatchObject({ aliases: [expect.any(String), expect.any(String)], value: { values: [expect.anything(), expect.anything()] } });
    expect(listed[0].rules).toEqual([{ when: { used: ["--option-0"], paired: true, platform: null, assay: null }, boost: 10 }]);
    const listOptions = timeLookups(opened.catalog, 200).find((timing) => timing.name === "listOptions")!;
    opened.catalog.close();
    expect(listOptions.medianMs).toBeLessThan(LOOKUP_BUDGET_MS);
  });
});
