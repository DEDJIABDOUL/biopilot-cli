// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// BIOPILOT: end-to-end sessions get their own data folder (XDG_DATA_HOME in the run's temporary folder),
// with the resources of the build under test unpacked into it: they never use nor change the user's own
// installation (~/.local/share/biopilot), whatever version it is.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const tmpdirSetup = require("./tmpdir-setup.cjs");

module.exports = async () => {
  await tmpdirSetup();
  process.env.XDG_DATA_HOME = path.join(process.env.BIOPILOT_JEST_TMPDIR, "data");
  const reinit = spawnSync(process.execPath, [path.join(__dirname, "..", "..", "build", "index.js"), "reinit"], { env: process.env, encoding: "utf-8" });
  if (reinit.status !== 0) throw new Error(`e2e setup: biopilot reinit failed (run npm run build first)\n${reinit.stdout}${reinit.stderr}`);
};
