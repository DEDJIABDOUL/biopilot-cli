// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Profiles read by an earlier help reader are dropped once, so that they are read again with the current one
// (1.1.0's reader missed bowtie2's -x); the rest of the User store stays.

import path from "node:path";
import Database from "better-sqlite3";
import { HELP_READER_VERSION } from "../../../biopilot/profile/helpParser.js";
import { openUserStore, type Profile } from "../../../biopilot/profile/userStore.js";
import { tempDir } from "../helpers.js";

const profile: Profile = {
  tool: "bowtie2",
  version: "2.5.5",
  command: "",
  options: [{ names: ["-p", "--threads"], takesValue: true, description: "threads" }],
  fingerprint: "fp",
  createdAt: 1,
};

/** A store as 1.1.0 left it: a Profile, a probed version, a learned tool, usage, and no `user_version`. */
const storeOf110 = (): string => {
  const file = path.join(tempDir(), "user.db");
  const store = openUserStore({ create: true, file });
  if (!store) throw new Error("test setup");
  store.putProfile(profile);
  store.putProbedVersion("fp", "bowtie2", "2.5.5");
  store.putLearnedTool({
    name: "mytool",
    description: "a learned tool",
    query: { package: "mytool", versionArgs: [], versionRegex: "", helps: [] },
    subcommands: [],
    learnedAt: 1,
  });
  store.addUsage("bowtie2", "", "--threads", 1);
  store.close();
  const db = new Database(file);
  db.pragma("user_version = 0");
  db.close();
  return file;
};

describe("User store: Profiles of an earlier help reader", () => {
  test("are dropped when the store is opened, and the store records the current reader", () => {
    const file = storeOf110();
    const store = openUserStore({ create: false, file });
    expect(store?.getProfile("bowtie2", "2.5.5", "")).toBeUndefined();
    store?.close();
    const db = new Database(file, { readonly: true });
    expect(db.pragma("user_version", { simple: true })).toBe(HELP_READER_VERSION);
    db.close();
  });

  test("the probed versions, learned tools and usage stay", () => {
    const store = openUserStore({ create: false, file: storeOf110() });
    expect(store?.probedVersion("fp")).toBe("2.5.5");
    expect(store?.getLearnedTool("mytool")).toBeDefined();
    expect(store?.usageCounts("bowtie2", "").get("--threads")).toBe(1);
    store?.close();
  });

  test("Profiles read by the current reader stay across openings", () => {
    const file = storeOf110();
    openUserStore({ create: false, file })?.close();
    const store = openUserStore({ create: false, file });
    store?.putProfile(profile);
    store?.close();
    const reopened = openUserStore({ create: false, file });
    expect(reopened?.getProfile("bowtie2", "2.5.5", "")?.options).toEqual(profile.options);
    reopened?.close();
  });
});
