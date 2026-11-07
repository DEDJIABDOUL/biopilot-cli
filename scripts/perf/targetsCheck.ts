// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The spec §11 targets and their check (ticket #66). Timings and memory vary from run to run: they may
// exceed their target by up to 20 % (spec §14). Sizes are deterministic: their limit is exact.

import {
  COLD_SUGGESTION_BUDGET_MS,
  LOOKUP_BUDGET_MS,
  PROJECT_SCAN_BUDGET_MS,
  WARM_SUGGESTION_BUDGET_MS,
  catalogSizeBudget,
} from "../../src/biopilot/knowledge/budget.js";

/** Spec §14: a measured target fails only when exceeded by more than 20 %. */
export const TOLERANCE = 1.2;
const SESSION_ADDED_MS = 100;
const MEMORY_ADDED_MB = 30;
/** Spec §11: the installed binary no more than 10 % larger than the original's. */
const BINARY_GROWTH = 1.1;

export type Measures = {
  session?: { biopilotStartupMs: number; upstreamStartupMs: number; biopilotPeakRssBytes: number; upstreamPeakRssBytes: number };
  suggestions?: { coldMs: number; warmMs: number };
  lookupMs?: number;
  projectScanMs?: number;
  catalog?: { bytes: number; tools: number };
  binary?: { bytes: number; upstreamBytes: number };
};

export type TargetResult = { name: string; unit: string; value: number | null; target: number; limit: number; ok: boolean };

const round = (value: number) => Math.round(value * 1000) / 1000;

const target = (name: string, unit: string, value: number | undefined, goal: number, tolerant: boolean): TargetResult => {
  const limit = round(tolerant ? goal * TOLERANCE : goal);
  const measured = value === undefined || Number.isNaN(value) ? null : round(value);
  return { name, unit, value: measured, target: goal, limit, ok: measured !== null && measured <= limit };
};

export const evaluateTargets = (measures: Measures): TargetResult[] => {
  const { session, suggestions, catalog, binary } = measures;
  return [
    target("session startup added by BioPilot", "ms", session && session.biopilotStartupMs - session.upstreamStartupMs, SESSION_ADDED_MS, true),
    target("memory added by BioPilot", "MB", session && (session.biopilotPeakRssBytes - session.upstreamPeakRssBytes) / 1e6, MEMORY_ADDED_MB, true),
    target("cold first suggestion", "ms", suggestions?.coldMs, COLD_SUGGESTION_BUDGET_MS, true),
    target("warm suggestion", "ms", suggestions?.warmMs, WARM_SUGGESTION_BUDGET_MS, true),
    target("SQLite lookup", "ms", measures.lookupMs, LOOKUP_BUDGET_MS, true),
    target("project scan (2 000 entries)", "ms", measures.projectScanMs, PROJECT_SCAN_BUDGET_MS, true),
    target("knowledge.db size", "bytes", catalog?.bytes, catalog ? catalogSizeBudget(catalog.tools) : 0, false),
    target("installed binary size", "bytes", binary?.bytes, binary ? Math.floor(binary.upstreamBytes * BINARY_GROWTH) : 0, false),
  ];
};
