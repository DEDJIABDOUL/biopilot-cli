// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// M7 (ticket #63): the status line says what BioPilot detected for the Catalog Tool on the line.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { statusLineFor } from "../../../biopilot/engine/statusLine.js";
import { typedPart } from "../../../biopilot/engine/liveCheck.js";
import { getConfig } from "../../../utils/config.js";
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

describe("the live Warning of biopilot check (ticket #110)", () => {
  const project = (files: string[], config?: string) => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, ".git"));
    for (const file of files) {
      fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "");
    }
    if (config) fs.writeFileSync(path.join(root, ".biopilot.toml"), config);
    return root;
  };
  const reads = ["data/s1_R1.fastq.gz", "data/s1_R2.fastq.gz", "data/s2_R1.fastq.gz", "data/s2_R2.fastq.gz"];
  const line = "fastp --in1 data/s1_R1.fastq.gz --in2 data/s2_R2.fastq.gz ";
  const statusIn = async (typed: string, cwd: string) => {
    await runtime.getSuggestions(typed, cwd, Shell.Bash);
    return statusLineFor(typed, cwd);
  };

  test("the first Warning leads the status line", async () => {
    expect(await statusIn(line, project(reads))).toBe(
      "⚠ --in2 data/s2_R2.fastq.gz is not the mate of --in1 data/s1_R1.fastq.gz: samples s1 and s2 · fastp · not installed: options from the Catalog",
    );
  });

  test("the word being typed is left out", async () => {
    expect(typedPart("fastp --in1 data/s")).toBe("fastp --in1 ");
    expect(typedPart("fastp --in1 data/s1_R1.fastq.gz ")).toBe("fastp --in1 data/s1_R1.fastq.gz ");
    expect(await statusIn("fastp --in1 data/missi", project(reads))).toBe("fastp · not installed: options from the Catalog");
  });

  test("a correct line shows no Warning", async () => {
    expect(await statusIn("fastp --in1 data/s1_R1.fastq.gz --in2 data/s1_R2.fastq.gz ", project(reads))).toBe(
      "fastp · not installed: options from the Catalog",
    );
  });

  test("warnings = false in .biopilot.toml hides it in that project", async () => {
    expect(await statusIn(line, project(reads, "warnings = false\n"))).toBe("fastp · not installed: options from the Catalog");
  });

  test("warnings = false in the settings hides it everywhere", async () => {
    const config = getConfig();
    config.warnings = false;
    try {
      expect(await statusIn(line, project(reads))).toBe("fastp · not installed: options from the Catalog");
    } finally {
      config.warnings = true;
    }
  });

  test("without a folder (the status line of M7 alone), no Warning", async () => {
    await runtime.getSuggestions(line, project(reads), Shell.Bash);
    expect(statusLineFor(line)).toBe("fastp · not installed: options from the Catalog");
  });
});
