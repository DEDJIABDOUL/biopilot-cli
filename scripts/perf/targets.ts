// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run perf:targets` (ticket #66): checks every spec §11 target, with the §14 tolerance for timings
// and memory (see targetsCheck.ts). The session cost and memory are measured against the unmodified
// upstream engine (tag 0.0.4) built in a temporary worktree on the same machine, so that the runner's own
// speed cancels out. Both sessions use a temporary data folder: never the user's own installation.
// Prints a JSON report; exits 1 when a target is missed.
// Usage: npm run build && [npm run package &&] tsx scripts/perf/targets.ts
//   BIOPILOT_UPSTREAM_DIR   an upstream 0.0.4 checkout already installed and built (skips the worktree)
//   BIOPILOT_TARGETS_RUNS   sessions per side (default 3, median kept)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateTargets, type Measures } from "./targetsCheck.js";

const UPSTREAM_TAG = "0.0.4";
const runs = Number(process.env.BIOPILOT_TARGETS_RUNS ?? 3);
const repo = process.cwd();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-targets-"));
const log = (text: string) => process.stderr.write(`perf:targets: ${text}\n`);

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const json = <T>(text: string): T => JSON.parse(text.slice(text.indexOf("{"))) as T;

/** Runs a command, failing loudly with its output. */
const run = (file: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  const result = spawnSync(file, args, { cwd: options.cwd ?? repo, env: options.env ?? process.env, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${file} ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

/** One real session per run, in a data folder of its own; median startup and peak RSS. */
const sessions = (dir: string, dataHome: string) => {
  const env = { ...process.env, XDG_DATA_HOME: dataHome };
  run(process.execPath, ["build/index.js", "reinit"], { cwd: dir, env });
  const measured = Array.from({ length: runs }, () =>
    json<{ startupMilliseconds: number; runtimeMetrics?: { peakMemoryBytes?: { rss?: number } } }>(
      run(process.execPath, ["--import", "tsx", "scripts/perf/session.ts"], { cwd: dir, env }),
    ),
  );
  return {
    startupMs: median(measured.map((m) => m.startupMilliseconds)),
    peakRssBytes: median(measured.map((m) => m.runtimeMetrics?.peakMemoryBytes?.rss ?? NaN)),
  };
};

/** The upstream engine, installed and built in a temporary worktree (or the one given). */
const upstream = (): { dir: string; temporary: boolean } => {
  if (process.env.BIOPILOT_UPSTREAM_DIR) return { dir: process.env.BIOPILOT_UPSTREAM_DIR, temporary: false };
  const dir = path.join(work, "upstream");
  log(`building upstream ${UPSTREAM_TAG} in ${dir}`);
  // A shallow or tag-less clone (CI) may lack the tag: fetch it first.
  if (spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${UPSTREAM_TAG}`], { cwd: repo }).status !== 0) {
    run("git", ["fetch", "--no-tags", "origin", `refs/tags/${UPSTREAM_TAG}:refs/tags/${UPSTREAM_TAG}`]);
  }
  run("git", ["worktree", "add", "--detach", dir, UPSTREAM_TAG]);
  run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir });
  run("npm", ["run", "build"], { cwd: dir });
  return { dir, temporary: true };
};

const binarySize = (file: string) => (fs.existsSync(file) ? fs.statSync(file).size : undefined);

let upstreamDir: { dir: string; temporary: boolean } | undefined;
let exitCode = 0;
try {
  // Catalog lookups, suggestions, project scan and Catalog size: perf:catalog, its own budgets lifted
  // (the targets below decide).
  log("perf:catalog");
  const lifted = {
    BIOPILOT_LOOKUP_BUDGET_MS: "1e9",
    BIOPILOT_COLD_SUGGESTION_BUDGET_MS: "1e9",
    BIOPILOT_WARM_SUGGESTION_BUDGET_MS: "1e9",
    BIOPILOT_SCAN_BUDGET_MS: "1e9",
  };
  const catalog = json<{
    tools: number;
    size: { bytes: number };
    scenarios: { lookups: { medianMs: number }[] }[];
    suggestions: { cold: { medianMs: number }; warm: { medianMs: number }[] };
    projectScan: { medianMs: number };
  }>(run(process.execPath, ["--import", "tsx", "scripts/perf/catalog.ts", "300"], { env: { ...process.env, ...lifted } }));

  log("BioPilot sessions");
  const biopilot = sessions(repo, path.join(work, "data-biopilot"));
  upstreamDir = upstream();
  log("upstream sessions");
  const original = sessions(upstreamDir.dir, path.join(work, "data-upstream"));

  const target = `${process.platform}-${process.arch}`;
  const binary = binarySize(path.join(repo, "pkg", `biopilot-${target}`));
  const upstreamBinary = binarySize(path.join(upstreamDir.dir, "pkg", `inshellisense-${target}`)) ?? (target === "linux-x64" ? 137_956_544 : undefined); // docs/perf/baseline-0.0.4.md

  const measures: Measures = {
    session: {
      biopilotStartupMs: biopilot.startupMs,
      upstreamStartupMs: original.startupMs,
      biopilotPeakRssBytes: biopilot.peakRssBytes,
      upstreamPeakRssBytes: original.peakRssBytes,
    },
    suggestions: { coldMs: catalog.suggestions.cold.medianMs, warmMs: Math.max(...catalog.suggestions.warm.map((w) => w.medianMs)) },
    lookupMs: Math.max(...catalog.scenarios.flatMap((scenario) => scenario.lookups.map((lookup) => lookup.medianMs))),
    projectScanMs: catalog.projectScan.medianMs,
    catalog: { bytes: catalog.size.bytes, tools: catalog.tools },
    binary: binary !== undefined && upstreamBinary !== undefined ? { bytes: binary, upstreamBytes: upstreamBinary } : undefined,
  };
  const targets = evaluateTargets(measures);
  process.stdout.write(`${JSON.stringify({ measures, targets }, null, 2)}\n`);
  for (const result of targets.filter((t) => !t.ok))
    log(`MISSED ${result.name}: ${result.value ?? "not measured"} ${result.unit} > ${result.limit} ${result.unit}`);
  exitCode = targets.every((t) => t.ok) ? 0 : 1;
} catch (error) {
  log((error as Error).message);
  exitCode = 1;
} finally {
  if (upstreamDir?.temporary) spawnSync("git", ["worktree", "remove", "--force", upstreamDir.dir], { cwd: repo });
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(exitCode);
