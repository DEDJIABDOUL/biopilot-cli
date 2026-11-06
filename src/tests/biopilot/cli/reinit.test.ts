// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot reinit` from source, in a child process whose home and data directory are temporary folders.

import { jest } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const reinit = (home: string, dataHome: string) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "index.ts"), "reinit"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, XDG_DATA_HOME: dataHome, XDG_CONFIG_HOME: path.join(home, ".config"), BIOPILOT_CATALOG: "", FORCE_COLOR: "0" },
    encoding: "utf-8",
  });
  if (result.status !== 0) throw new Error(`reinit failed (${result.status}): ${result.stderr}`);
};

jest.setTimeout(120_000);

describe("biopilot reinit", () => {
  test("removes an out-of-date Catalog but never touches the User store", () => {
    const home = tempDir();
    const dataHome = tempDir();
    const dataDir = path.join(dataHome, "biopilot");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "knowledge.db"), "stale catalog");
    fs.writeFileSync(path.join(dataDir, "user.db"), "learned tools");

    reinit(home, dataHome);

    // From source nothing is unpacked in its place: the Catalog compiled next to the build is used.
    expect(fs.existsSync(path.join(dataDir, "knowledge.db"))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, "user.db"), "utf-8")).toBe("learned tools");
    expect(fs.readFileSync(path.join(dataDir, "version.txt"), "utf-8")).not.toBe("");
  });

  test("keeps the User store when it leaves the legacy ~/.biopilot folder", () => {
    const home = tempDir();
    const dataHome = tempDir();
    fs.mkdirSync(path.join(home, ".biopilot"));
    fs.writeFileSync(path.join(home, ".biopilot", "user.db"), "learned tools");

    reinit(home, dataHome);

    expect(fs.existsSync(path.join(home, ".biopilot"))).toBe(false);
    expect(fs.readFileSync(path.join(dataHome, "biopilot", "user.db"), "utf-8")).toBe("learned tools");
  });
});
