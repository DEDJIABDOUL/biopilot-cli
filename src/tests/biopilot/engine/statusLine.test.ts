// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// M7 (ticket #63): the status line says what BioPilot detected for the Catalog Tool on the line.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { statusLineFor } from "../../../biopilot/engine/statusLine.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, outsideAnyProject, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const help = fs.readFileSync(path.join(repoRoot, "knowledge", "help", "fastp", "0.23.4", "root.txt"), "utf-8");
type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = path.join(tempDir(), "user.db");
  runtime = await import("../../../runtime/runtime.js");
});
afterEach(() => hideInstalledTools());

/** What the session shows for a line: suggestions first (they resolve the binary), then the status line. */
const status = async (line: string) => {
  await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash);
  return statusLineFor(line);
};

describe("the status line (M7)", () => {
  test("a tool not installed: the options come from the Catalog", async () => {
    expect(await status("fastp --")).toBe("fastp · not installed: options from the Catalog");
  });

  test("a conda tool: its version, where it came from, the environment", async () => {
    const env = writeFakeCondaEnv(tempDir(), "rnaseq", "fastp", "0.23.4");
    writeFakeTool(env.bin, "fastp", { "--help": help });
    setSessionEnvironment({ PATH: env.bin, CONDA_PREFIX: env.prefix });
    expect(await status("fastp --")).toBe("fastp 0.23.4 · conda-meta · env rnaseq · reading its real options…");
  });

  test("a tool whose version is not known yet", async () => {
    const bin = path.join(tempDir(), "bin");
    writeFakeTool(bin, "fastp", {});
    setSessionEnvironment({ PATH: bin, CONDA_PREFIX: undefined });
    expect(await status("fastp --")).toBe("fastp (version unknown) · reading its real options…");
  });

  test("nothing for a line that isn't a Catalog Tool, nor before any suggestion for it", async () => {
    expect(await status("git ch")).toBeUndefined();
    expect(statusLineFor("samtools sort -")).toBeUndefined();
    expect(statusLineFor("")).toBeUndefined();
  });
});
