// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// BIOPILOT: every test run gets its own temporary folder (TMPDIR, inherited by the test workers and the
// processes they spawn), removed at the end by tmpdir-teardown.cjs. Tests used to leave thousands of
// folders in the shared /tmp. The User store goes there too.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.exports = async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-jest-"));
  process.env.BIOPILOT_JEST_TMPDIR = runDir;
  process.env.TMPDIR = runDir;
  // Never the user's own User store: a test session may compute Profiles of tools really installed.
  process.env.BIOPILOT_USER_STORE = path.join(runDir, "user.db");
};
