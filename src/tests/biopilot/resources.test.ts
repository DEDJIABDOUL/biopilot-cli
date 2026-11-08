// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import fs from "node:fs";
import path from "node:path";
import { USER_STORE_FILE_NAME, installCatalog, moveUserStore, removeCatalog } from "../../biopilot/resources.js";
import { tempDir } from "./helpers.js";

const read = (file: string) => fs.readFileSync(file, "utf-8");

describe("Catalog in the data directory", () => {
  test("is written into a data directory that does not exist yet", async () => {
    const dataDir = path.join(tempDir(), "biopilot");
    await installCatalog(dataDir, Buffer.from("catalog v1"));
    expect(read(path.join(dataDir, "knowledge.db"))).toBe("catalog v1");
  });

  test("overwrites the previous Catalog (other resources are only copied when absent)", async () => {
    const dataDir = tempDir();
    await installCatalog(dataDir, Buffer.from("catalog v1"));
    await installCatalog(dataDir, Buffer.from("catalog v2"));
    expect(read(path.join(dataDir, "knowledge.db"))).toBe("catalog v2");
  });

  test("replacing it leaves the User store and no temporary file behind", async () => {
    const dataDir = tempDir();
    fs.writeFileSync(path.join(dataDir, USER_STORE_FILE_NAME), "learned tools");
    await installCatalog(dataDir, Buffer.from("catalog v1"));
    await installCatalog(dataDir, Buffer.from("catalog v2"));
    expect(fs.readdirSync(dataDir).sort()).toEqual(["knowledge.db", "user.db"]);
    expect(read(path.join(dataDir, USER_STORE_FILE_NAME))).toBe("learned tools");
  });

  test("removing it never touches the User store; removing it twice is harmless", () => {
    const dataDir = tempDir();
    fs.writeFileSync(path.join(dataDir, "knowledge.db"), "catalog");
    fs.writeFileSync(path.join(dataDir, USER_STORE_FILE_NAME), "learned tools");
    removeCatalog(dataDir);
    removeCatalog(dataDir);
    expect(fs.readdirSync(dataDir)).toEqual(["user.db"]);
  });
});

describe("User store when the data directory moves", () => {
  test("is moved to the new data directory", () => {
    const from = tempDir();
    const to = path.join(tempDir(), "biopilot");
    fs.writeFileSync(path.join(from, USER_STORE_FILE_NAME), "learned tools");
    moveUserStore(from, to);
    expect(read(path.join(to, USER_STORE_FILE_NAME))).toBe("learned tools");
    expect(fs.existsSync(path.join(from, USER_STORE_FILE_NAME))).toBe(false);
  });

  test("stays readable by its owner only, whatever the umask", () => {
    const from = tempDir();
    const to = path.join(tempDir(), "biopilot");
    fs.writeFileSync(path.join(from, USER_STORE_FILE_NAME), "usage", { mode: 0o644 });
    fs.writeFileSync(path.join(from, `${USER_STORE_FILE_NAME}-wal`), "journal", { mode: 0o644 });
    moveUserStore(from, to);
    expect(fs.statSync(path.join(to, USER_STORE_FILE_NAME)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(to, `${USER_STORE_FILE_NAME}-wal`)).mode & 0o777).toBe(0o600);
  });

  test("never overwrites a User store already in the new directory", () => {
    const from = tempDir();
    const to = tempDir();
    fs.writeFileSync(path.join(from, USER_STORE_FILE_NAME), "old");
    fs.writeFileSync(path.join(to, USER_STORE_FILE_NAME), "current");
    moveUserStore(from, to);
    expect(read(path.join(to, USER_STORE_FILE_NAME))).toBe("current");
  });

  test("does nothing when there is no User store", () => {
    const to = path.join(tempDir(), "biopilot");
    moveUserStore(tempDir(), to);
    expect(fs.existsSync(to)).toBe(false);
  });
});
