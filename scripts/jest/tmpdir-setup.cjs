// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// BIOPILOT: every test run gets its own temporary folder (TMPDIR, inherited by the test workers and the
// processes they spawn), removed at the end by tmpdir-teardown.cjs. Tests used to leave thousands of
// folders in the shared /tmp.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.exports = async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-jest-"));
  process.env.BIOPILOT_JEST_TMPDIR = runDir;
  process.env.TMPDIR = runDir;
};
