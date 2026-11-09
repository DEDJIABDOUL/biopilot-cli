// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The README's demo, step by step (ticket #104): what is typed, and how long the viewer gets to read.
// `npm run demo` plays it in a real BioPilot session and records it (scripts/demo/run.ts).

export type Step =
  /** Typed one key at a time. */
  | { type: string }
  /** A key: Tab accepts the highlighted suggestion, Enter runs the line. */
  | { key: "tab" | "enter" | "down" }
  /** A pause, in milliseconds. */
  | { wait: number };

const TAB = { key: "tab" } as const;
const ENTER = { key: "enter" } as const;

export const scene: Step[] = [
  { wait: 800 },
  // Options first by rank: --in1.
  { type: "fastp " },
  { wait: 1500 },
  TAB,
  // Files of the expected format, R1 first.
  { wait: 1500 },
  TAB,
  { wait: 700 },
  // Once read 1 is given, its mate option, then its mate file.
  { type: " --in" },
  { wait: 1300 },
  TAB,
  { wait: 1500 },
  TAB,
  { wait: 700 },
  // A derived output name, in results/.
  { type: " --out1 " },
  { wait: 1800 },
  TAB,
  { wait: 2000 },
  ENTER,
  { wait: 900 },
  // The reference index, as one entry.
  { type: "bwa mem " },
  { wait: 2000 },
  TAB,
  { wait: 1200 },
  ENTER,
  { wait: 900 },
  // An option found by what it does.
  { type: 'biopilot search "adapter sequence" --tool fastp' },
  { wait: 600 },
  ENTER,
  { wait: 4000 },
];
