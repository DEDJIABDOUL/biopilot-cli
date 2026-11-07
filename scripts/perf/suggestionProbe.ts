// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Child process of `npm run perf:catalog`: times the engine's suggestions for Catalog tools (spec §11).
// The first call of a fresh process is the cold one: the Catalog is not yet opened, no spec is built yet.
// Every line is then timed warm. Prints `{ coldMs, warm: { [line]: durations } }` as JSON.
// The Catalog comes from BIOPILOT_CATALOG. Usage: tsx scripts/perf/suggestionProbe.ts <samples> <line>...

import os from "node:os";
import { performance } from "node:perf_hooks";
import { getSuggestions } from "../../src/runtime/runtime.js";
import { Shell } from "../../src/utils/shell.js";

const [samplesArg, ...lines] = process.argv.slice(2);
const samples = Number.parseInt(samplesArg, 10);
const cwd = os.tmpdir();

const timed = async (line: string) => {
  const start = performance.now();
  const blob = await getSuggestions(line, cwd, Shell.Bash);
  const ms = performance.now() - start;
  if (!blob || blob.suggestions.length === 0) throw new Error(`no suggestion for \`${line}\`: is the Catalog available?`);
  return ms;
};

const coldMs = await timed(lines[0]);
const warm: Record<string, number[]> = {};
for (const line of lines) {
  await timed(line); // warm-up: builds the line's spec if it is not the cold line's
  warm[line] = [];
  for (let i = 0; i < samples; i++) warm[line].push(await timed(line));
}
process.stdout.write(JSON.stringify({ coldMs, warm }));
