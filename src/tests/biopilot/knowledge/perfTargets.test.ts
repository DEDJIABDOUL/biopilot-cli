// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run perf:targets` (ticket #66): every spec §11 target checked; timings and memory with the §14
// tolerance (+20 %), sizes exactly. The evaluation is tested on given measures; collecting them (a real
// session of BioPilot and of upstream 0.0.4) runs in CI.

import { evaluateTargets, type Measures } from "../../../../scripts/perf/targetsCheck.js";

const session = { biopilotStartupMs: 850, upstreamStartupMs: 820, biopilotPeakRssBytes: 90e6, upstreamPeakRssBytes: 86e6 };
const passing: Measures = {
  session,
  suggestions: { coldMs: 40, warmMs: 0.6 },
  lookupMs: 0.2,
  projectScanMs: 7,
  catalog: { bytes: 900_000, tools: 10 },
  binary: { bytes: 140_700_000, upstreamBytes: 137_956_544 },
};

describe("perf:targets evaluation", () => {
  test("every §11 target is checked and reported", () => {
    const report = evaluateTargets(passing);
    expect(report.map((target) => target.name)).toEqual([
      "session startup added by BioPilot",
      "memory added by BioPilot",
      "cold first suggestion",
      "warm suggestion",
      "SQLite lookup",
      "project scan (2 000 entries)",
      "knowledge.db size",
      "installed binary size",
    ]);
    expect(report.every((target) => target.ok)).toBe(true);
  });

  test("a timing may exceed its target by up to 20 % (§14), not more", () => {
    const at = (biopilotStartupMs: number) => evaluateTargets({ ...passing, session: { ...session, biopilotStartupMs } })[0];
    expect(at(820 + 119)).toMatchObject({ ok: true, value: 119, target: 100, limit: 120 });
    expect(at(820 + 121)).toMatchObject({ ok: false });
  });

  test("memory added is checked the same way", () => {
    const memory = evaluateTargets({ ...passing, session: { ...session, biopilotPeakRssBytes: 86e6 + 37e6 } })[1];
    expect(memory).toMatchObject({ ok: false, value: 37, target: 30, limit: 36 });
  });

  test("sizes are exact: the binary within upstream + 10 %, the Catalog within its budget", () => {
    const report = evaluateTargets({ ...passing, binary: { bytes: 137_956_544 * 1.11, upstreamBytes: 137_956_544 }, catalog: { bytes: 1_100_000, tools: 10 } });
    expect(report.find((target) => target.name === "installed binary size")?.ok).toBe(false);
    expect(report.find((target) => target.name === "knowledge.db size")?.ok).toBe(false);
  });

  test("a measure that could not be taken fails its target", () => {
    expect(evaluateTargets({ ...passing, binary: undefined }).find((target) => target.name === "installed binary size")).toMatchObject({
      ok: false,
      value: null,
    });
  });
});
