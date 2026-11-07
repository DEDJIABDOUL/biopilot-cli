// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot reset-usage` erases the usage statistics, and only them (ticket #51).

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import path from "node:path";
import url from "node:url";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const resetUsage = (store: string) =>
  spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "reset-usage"], {
    cwd: repoRoot,
    env: { ...process.env, BIOPILOT_USER_STORE: store, FORCE_COLOR: "0" },
    encoding: "utf-8",
  });

jest.setTimeout(60_000);

test("usage counts are erased; Profiles stay", () => {
  const store = path.join(tempDir(), "user.db");
  const opened = openUserStore({ create: true, file: store });
  opened?.addUsage("fastp", "", "--dedup");
  opened?.putProfile({ tool: "fastp", version: "1.0", command: "", options: [], fingerprint: "f", createdAt: 0 });
  opened?.close();

  const run = resetUsage(store);
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("usage statistics erased");
  const after = openUserStore({ create: false, file: store });
  expect(after?.usageCounts("fastp", "")).toEqual(new Map());
  expect(after?.getProfile("fastp", "1.0", "")).toBeDefined();
  after?.close();
});

test("without a User store there is nothing to erase, and that is not an error", () => {
  const run = resetUsage(path.join(tempDir(), "user.db"));
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("no usage statistics to erase");
});
