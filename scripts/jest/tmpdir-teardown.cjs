// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// BIOPILOT: removes the temporary folder of this test run (see tmpdir-setup.cjs).
const fs = require("node:fs");

module.exports = async () => {
  const runDir = process.env.BIOPILOT_JEST_TMPDIR;
  if (runDir && runDir.includes("biopilot-jest-")) fs.rmSync(runDir, { recursive: true, force: true });
};
