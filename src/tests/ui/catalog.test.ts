// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Catalog tools in a real bash session. Phase 2 exit (ticket #35): options in Catalog priority. Phase 3
// (ticket #44, M2): suggestions follow a PATH change in the same session (annex C scenarios 6 and 7).

import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import type { TuiTest } from "@microsoft/tui-test/test";
import { resolveBinary } from "../../biopilot/env/resolver";
import { openCatalog } from "../../biopilot/knowledge/catalog";
import { computeProfiles } from "../../biopilot/profile/compute";
import { openUserStore } from "../../biopilot/profile/userStore";
import { compileRepositoryCatalog, tempDir, writeFakeCondaEnv, writeFakeTool } from "../biopilot/helpers";
import { closeSession, expectPrompt, startSession } from "./helpers";

const accent = "#7d56f4";
const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..");

jest.retryTimes(2, { logErrorsBeforeRetry: true });

const session = (env: Record<string, string>, shell = "bash") =>
  startSession({ label: `${shell}-catalog`, shell, env: { BASH_SILENCE_DEPRECATION_WARNING: "1", ...env } }, ["-V", "-T", "-s", shell]);

describe("[bash] Catalog tools", () => {
  let terminal: TuiTest;
  beforeEach(async () => {
    terminal = await session({ BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath });
  });
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("`fastp --` shows fastp's options, --in1 first", async () => {
    await terminal.type("fastp --");

    await terminal.expectText("--in1", { strict: false, bg: accent });
    await terminal.expectText("--thread", { strict: false });
  });
});

describe.each(["bash", "zsh", "fish"])("[%s] suggestions follow the shell's PATH (M2)", (shell) => {
  const root = tempDir();
  const catalogPath = compileRepositoryCatalog().catalogPath;
  const store = path.join(root, "user.db");
  /** A conda environment with a fake fastp printing its recorded help, synced into the User store. */
  const fastpEnv = (version: string) => {
    const env = writeFakeCondaEnv(root, `fastp-${version}`, "fastp", version);
    const help = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", version, "root.txt"), "utf-8");
    writeFakeTool(env.bin, "fastp", { "--help": help, "--version": `fastp ${version}\n` });
    const opened = openCatalog(catalogPath);
    const userStore = openUserStore({ create: true, file: store });
    const binary = resolveBinary("fastp", env.bin);
    const query = opened.available ? opened.catalog.getToolQuery("fastp") : undefined;
    if (!opened.available || !userStore || !binary || !query) throw new Error("test setup");
    computeProfiles("fastp", binary, query, userStore);
    userStore.close();
    opened.catalog.close();
    return env.bin;
  };
  const recent = fastpEnv("0.23.4");
  const old = fastpEnv("0.20.1");

  let terminal: TuiTest;
  beforeEach(async () => {
    terminal = await session({ BIOPILOT_CATALOG: catalogPath, BIOPILOT_USER_STORE: store, PATH: `${recent}:${process.env.PATH}` }, shell);
  });
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("`fastp --de` shows --dedup with fastp 0.23.4, and no longer once PATH leads to 0.20.1", async () => {
    await terminal.type("fastp --de");
    await terminal.expectText("--dedup", { strict: false });

    await terminal.write("\u0015"); // clear the line
    await expectPrompt(terminal);
    await terminal.write(shell === "fish" ? `set -gx PATH ${old} $PATH\r` : `export PATH=${old}:$PATH\r`);
    await expectPrompt(terminal);

    await terminal.type("fastp --de");
    await terminal.expectText("--detect_adapter_for_pe", { strict: false });
    await terminal.expectText("--dedup", { strict: false, not: true });
  });
});
