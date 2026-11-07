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
  // BIOPILOT: spec §14, coverage of the BioPilot core above 80 % (with --coverage, as CI runs it). The
  // command declarations (Commander glue) are left out: they run in child processes, through the real
  // entry point, where coverage cannot see them.
  collectCoverageFrom: [
    "src/biopilot/**/*.ts",
    "!src/biopilot/cli/{info,status,sync,uninstall,resetUsage,computeProfile,doctor,learn,search}.ts",
  ],
  coverageThreshold: { global: { lines: 80 } },
  coverageReporters: ["text-summary"],
};
