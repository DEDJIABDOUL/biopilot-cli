// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Synthetic tool sources for the Catalog budgets (spec §11): shared by `npm run perf:catalog` and the tests.

/**
 * A typical tool: 30 options on the root command, 3 subcommands of 15. Fifty of them is the spec's reference
 * size; a lookup that scans every option of every tool (a missing index) is then far over budget.
 */
export const syntheticTool = (name: string): string => {
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

/** Sources of 50 typical tools, by file name. */
export const fiftyTypicalTools = (): Record<string, string> =>
  Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`t${i}.yml`, syntheticTool(`tool${i}`)]));

export const LARGE_COMMAND_OPTIONS = 150;

/**
 * A root command with 150 options, each with two aliases, two suggested values and a rule: more than a real
 * tool has (fastp has about 90), so listing it must stay within budget.
 */
export const largeCommandTool = (): string => {
  const options = Array.from({ length: LARGE_COMMAND_OPTIONS }, (_, i) =>
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
  return `name: large\nversion: { args: ["--version"], regex: 'v(\\S+)' }\noptions:\n${options}\n`;
};
