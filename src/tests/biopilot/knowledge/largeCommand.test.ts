// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// A real tool's root command can have well over a hundred options (fastp has about 90). Listing one must
// return every option complete; its time is checked by `npm run perf:catalog`, run alone in CI.

import { LARGE_COMMAND_OPTIONS, largeCommandTool } from "../../../../scripts/perf/catalogScenarios.js";
import { openCatalog } from "../../../biopilot/knowledge/catalog.js";
import { compileValid } from "../helpers.js";

describe("Catalog reader on a large command", () => {
  test(`lists all ${LARGE_COMMAND_OPTIONS} options, each with its aliases, values and rules`, () => {
    const opened = openCatalog(compileValid({ "large.yml": largeCommandTool() }));
    if (!opened.available) throw new Error(opened.detail);
    const listed = opened.catalog.listOptions(opened.catalog.getCommand("large")!);
    opened.catalog.close();
    expect(listed).toHaveLength(LARGE_COMMAND_OPTIONS);
    for (const option of listed) {
      expect(option.aliases).toHaveLength(2);
      expect(option.value?.values).toHaveLength(2);
      expect(option.rules).toEqual([{ when: { used: ["--option-0"], paired: true, platform: null, assay: null }, boost: 10 }]);
    }
  });
});
