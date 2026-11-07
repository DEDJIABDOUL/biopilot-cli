// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine suggests the options of the binary the shell would run (ticket #43): its Profile enriched by
// the Catalog, or the Catalog filtered by its version, or the Catalog alone. Fake fastp binaries print the
// real recorded helps of knowledge/help; the session's PATH points to one or the other.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { resolveBinary } from "../../../biopilot/env/resolver.js";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { openCatalog } from "../../../biopilot/knowledge/catalog.js";
import { computeProfiles } from "../../../biopilot/profile/compute.js";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, tempDir, writeFakeCondaEnv, writeFakeTool, outsideAnyProject } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const recorded = (version: string) => fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", version, "root.txt"), "utf-8");

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
const root = tempDir();
const store = path.join(root, "user.db");
const catalogPath = compileRepositoryCatalog().catalogPath;

/** A conda environment with a fake fastp of that version; `help` defaults to the recorded one. */
const fastpEnv = (name: string, version: string, help = recorded(version)) => {
  const env = writeFakeCondaEnv(root, name, "fastp", version);
  writeFakeTool(env.bin, "fastp", { "--help": help, "--version": `fastp ${version}\n` });
  return env.bin;
};

/** What `biopilot sync` does, for the fastp found in `bin`. */
const sync = (bin: string) => {
  const opened = openCatalog(catalogPath);
  const userStore = openUserStore({ create: true, file: store });
  if (!opened.available || !userStore) throw new Error("test setup");
  const binary = resolveBinary("fastp", bin);
  const query = opened.catalog.getToolQuery("fastp");
  if (!binary || !query) throw new Error("test setup");
  computeProfiles("fastp", binary, query, userStore);
  userStore.close();
  opened.catalog.close();
};

const synced023 = fastpEnv("synced-0.23.4", "0.23.4");
const synced020 = fastpEnv("synced-0.20.1", "0.20.1");
const versionOnly020 = fastpEnv("unsynced-0.20.1", "0.20.1");
const versionOnly023 = fastpEnv("unsynced-0.23.4", "0.23.4");
const extraHelp = `${recorded("0.23.4")}      --brand-new-flag                 a flag this release added\n`;
const withNewFlag = fastpEnv("new-flag", "0.24.0", extraHelp);
const emptyHelp = fastpEnv("empty-help", "0.25.0", "fastp: no help today\n");

beforeAll(async () => {
  process.env.BIOPILOT_CATALOG = catalogPath;
  process.env.BIOPILOT_USER_STORE = store;
  for (const bin of [synced023, synced020, withNewFlag, emptyHelp]) sync(bin);
  runtime = await import("../../../runtime/runtime.js");
});

const suggest = async (line: string, bin: string) => {
  setSessionEnvironment({ PATH: bin });
  return (await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash))?.suggestions ?? [];
};
const names = async (line: string, bin: string) => (await suggest(line, bin)).map((s) => s.name);

describe("suggestions follow the active binary", () => {
  test("annex C 6 and 7: `fastp --de` shows --dedup with 0.23.4, not with 0.20.1, in the same session", async () => {
    expect(await names("fastp --de", synced023)).toContain("--dedup");
    expect(await names("fastp --de", synced020)).not.toContain("--dedup");
    expect(await names("fastp --de", synced023)).toContain("--dedup");
  });

  test("an option both in the Profile and the Catalog keeps the Catalog's description and rank", async () => {
    const in1 = (await suggest("fastp --", synced020)).find((s) => s.name === "--in1");
    expect(in1).toMatchObject({ priority: 95, description: expect.stringMatching(/^FASTQ file of read 1/) });
  });

  test("an option only in the Profile is suggested with the help's description and the default rank", async () => {
    const flag = (await suggest("fastp --brand", withNewFlag)).find((s) => s.name === "--brand-new-flag");
    expect(flag).toMatchObject({ description: "a flag this release added", priority: 50 });
  });

  test("without a Profile, the Catalog options are filtered by the version conda-meta gives", async () => {
    expect(await names("fastp --de", versionOnly020)).not.toContain("--dedup");
    expect(await names("fastp --de", versionOnly023)).toContain("--dedup");
  });

  test("a help that gave no option falls back to the Catalog", async () => {
    expect(await names("fastp --de", emptyHelp)).toContain("--dedup");
  });

  test("a tool missing from the machine keeps the Catalog's options", async () => {
    expect(await names("fastp --de", path.join(root, "nowhere"))).toContain("--dedup");
  });
});
