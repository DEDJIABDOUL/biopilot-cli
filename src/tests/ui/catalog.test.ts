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
  const fastpEnv = async (version: string) => {
    const env = writeFakeCondaEnv(root, `fastp-${version}`, "fastp", version);
    const help = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", version, "root.txt"), "utf-8");
    writeFakeTool(env.bin, "fastp", { "--help": help, "--version": `fastp ${version}\n` });
    const opened = openCatalog(catalogPath);
    const userStore = openUserStore({ create: true, file: store });
    const binary = resolveBinary("fastp", env.bin);
    const query = opened.available ? opened.catalog.getToolQuery("fastp") : undefined;
    if (!opened.available || !userStore || !binary || !query) throw new Error("test setup");
    await computeProfiles("fastp", binary, query, userStore);
    userStore.close();
    opened.catalog.close();
    return env.bin;
  };
  let recent: string;
  let old: string;
  beforeAll(async () => {
    recent = await fastpEnv("0.23.4");
    old = await fastpEnv("0.20.1");
  });

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

describe("[bash] an unknown Profile is computed in the background (ADR-0002)", () => {
  const root = tempDir();
  const bin = path.join(root, "bin");
  // Outside conda and never synced: neither its version nor its Profile is known when typing starts.
  const help = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", "0.20.1", "root.txt"), "utf-8");
  writeFakeTool(bin, "fastp", { "--help": help, "--version": "fastp 0.20.1\n" });

  let terminal: TuiTest;
  beforeEach(async () => {
    terminal = await session({
      BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath,
      BIOPILOT_USER_STORE: path.join(tempDir(), "user.db"),
      PATH: `${bin}:${process.env.PATH}`,
    });
  });
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("without sync, --dedup leaves fastp 0.20.1's suggestions once its Profile lands", async () => {
    await terminal.type("fastp --de");
    await terminal.expectText("--dedup", { strict: false }); // the Catalog meanwhile: nothing waited for

    // The Profile lands in the background; typing again picks it up.
    // The screen is read only once it is idle: right after a keystroke it may still show the old list.
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await terminal.press("Backspace");
      await terminal.type("e");
      await terminal.waitIdle();
      await terminal.expectText("--detect_adapter_for_pe", { strict: false });
      if (!(await terminal.text()).includes("--dedup")) break;
    }
    await terminal.expectText("--dedup", { strict: false, not: true });
  });
});

describe("[bash] the project context (phase 4)", () => {
  const project = tempDir();
  for (const file of ["data/ctrl_R1.fastq.gz", "data/ctrl_R2.fastq.gz", "data/treat_R1.fastq.gz", "data/treat_R2.fastq.gz"]) {
    fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
    fs.writeFileSync(path.join(project, file), "");
  }
  fs.mkdirSync(path.join(project, ".git"));
  fs.mkdirSync(path.join(project, "results"));
  const store = path.join(tempDir(), "user.db");

  let terminal: TuiTest;
  beforeEach(async () => {
    terminal = await session({ BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath, BIOPILOT_USER_STORE: store });
    // Typing must wait for the prompt that follows `cd`: clear the screen and wait for it to be empty.
    await terminal.write(`cd ${project}; clear\r`);
    await terminal.expectText("cd ", { strict: false, not: true });
    await expectPrompt(terminal);
  });
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("annex C 3: after an R1, `--in2` shows its mate first", async () => {
    await terminal.type("fastp --in1 data/treat_R1.fastq.gz --in2 ");
    await terminal.expectText("data/treat_R2.fastq.gz", { strict: false, bg: accent });
  });

  test("M12: an option accepted with Tab is counted in the User store", async () => {
    await terminal.type("fastp --fix_m"); // Tab completes it to --fix_mgi_id
    await terminal.expectText("┘", { strict: false }); // the suggestion list is shown
    await terminal.waitIdle();
    await terminal.press("Tab");
    // Recorded asynchronously, without ever blocking the keystroke.
    let counted: number | undefined;
    for (let attempt = 0; attempt < 25 && counted === undefined; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const opened = openUserStore({ create: false, file: store });
      counted = opened?.usageCounts("fastp", "").get("--fix_mgi_id");
      opened?.close();
    }
    expect(counted).toBe(1);
  });
});

describe("[bash] the status line (M7)", () => {
  // Only node's folder and the system's: no fastp installed.
  const noFastp = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
  const off = tempDir();
  fs.mkdirSync(path.join(off, "biopilot"));
  fs.writeFileSync(path.join(off, "biopilot", "rc.toml"), "statusLine = false\n");

  let terminal: TuiTest;
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("under the suggestions, what BioPilot detected for the tool", async () => {
    terminal = await session({ BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath, PATH: noFastp });
    await terminal.type("fastp --");
    await terminal.expectText("not installed: options from the Catalog", { strict: false });
  });

  test("statusLine = false in rc.toml hides it", async () => {
    terminal = await session({ BIOPILOT_CATALOG: compileRepositoryCatalog().catalogPath, PATH: noFastp, XDG_CONFIG_HOME: off });
    await terminal.type("fastp --");
    await terminal.expectText("--in1", { strict: false, bg: accent });
    await terminal.expectText("not installed", { strict: false, not: true });
  });
});
