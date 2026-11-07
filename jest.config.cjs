// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // [...]
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "src/tests/ui/", ".tui-test/", "/.claude/"],
  // BIOPILOT: one temporary folder per test run, removed at the end; agent worktrees under .claude/ ignored.
  globalSetup: "<rootDir>/scripts/jest/tmpdir-setup.cjs",
  globalTeardown: "<rootDir>/scripts/jest/tmpdir-teardown.cjs",
};
