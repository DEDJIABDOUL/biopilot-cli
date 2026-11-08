// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot learn` (ticket #73): an installed tool absent from the Catalog is imported from its own --help,
// then completed like a Catalog Tool. Only this explicit command ever runs an unknown tool (spec §12).

import fs from "node:fs";
import path from "node:path";
import { runLearn } from "../../../biopilot/cli/learnRunner.js";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { setSessionEnvironment } from "../../../biopilot/env/session.js";
import { statusLineFor } from "../../../biopilot/engine/statusLine.js";
import { recordAcceptedSuggestion } from "../../../biopilot/engine/usage.js";
import { Shell } from "../../../utils/shell.js";
import { compileRepositoryCatalog, hideInstalledTools, outsideAnyProject, tempDir, writeFakeTool } from "../helpers.js";

const ROOT_HELP = `mytool: aligns things

Usage: mytool <command> [options]

Commands:
  align    align reads to a reference
  index    build an index
  update   update the databases
  help     print this help

Options:
  -t, --threads INT   number of threads
  -v, --verbose       say more
`;
const ALIGN_HELP = "Usage: mytool align [options] <ref> <reads>\n\n  -x, --preset STR   alignment preset\n      --secondary     output secondary alignments\n";
const INDEX_USAGE = "Usage: mytool index [options] <ref>\n\n  -k INT   k-mer size\n";

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
const store = path.join(tempDir(), "user.db");
const bin = path.join(tempDir(), "bin");
const calls = path.join(tempDir(), "calls.log");
writeFakeTool(bin, "mytool", { "--help": ROOT_HELP, "align --help": ALIGN_HELP, index: INDEX_USAGE, "--version": "mytool version 2.3.1\n" }, calls);

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t), env: { PATH: bin }, cwd: tempDir() } };
};
const names = async (line: string) => ((await runtime.getSuggestions(line, outsideAnyProject, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileRepositoryCatalog().catalogPath;
  process.env.BIOPILOT_USER_STORE = store;
  runtime = await import("../../../runtime/runtime.js");
});

describe("biopilot learn", () => {
  test("typing an unknown command never runs it", async () => {
    setSessionEnvironment({ PATH: bin, CONDA_PREFIX: undefined });
    await names("mytool --");
    await names("mytool align -");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fs.existsSync(calls) ? fs.readFileSync(calls, "utf-8") : "").toBe("");
  });

  test("imports the tool: its subcommands, its version, its Profiles", async () => {
    const { out, io } = capture();
    expect(await runLearn(["mytool"], io)).toBe(0);
    expect(out.join("")).toMatch(/learned mytool 2\.3\.1: 2 subcommands \(align, index\)/);
    // `index` prints its usage bare (bwa's way); `update` would act: it is never run without arguments.
    const ran = fs.readFileSync(calls, "utf-8").split("\n");
    expect(ran).toContain("index");
    expect(ran).not.toContain("update");
  });

  test("then it is completed like a Catalog Tool, in the same session", async () => {
    setSessionEnvironment({ PATH: bin, CONDA_PREFIX: undefined });
    await new Promise((resolve) => setTimeout(resolve, 2_100)); // past the recheck of unknown names
    expect(await names("mytool --")).toEqual(expect.arrayContaining(["--threads", "--verbose"]));
    expect(await names("mytool ")).toEqual(expect.arrayContaining(["align", "index"]));
    expect(await names("mytool align --")).toEqual(expect.arrayContaining(["--preset", "--secondary"]));
    expect(await names("mytool index -")).toContain("-k");
    expect(await names("myt")).toContain("mytool");
    expect(statusLineFor("mytool --")).toBe("mytool 2.3.1 · version command");
  });

  test("its options are ranked by usage, like any other (spec §6.5)", async () => {
    setSessionEnvironment({ PATH: bin, CONDA_PREFIX: undefined });
    const priority = async () =>
      ((await runtime.getSuggestions("mytool align --", outsideAnyProject, Shell.Bash))?.suggestions ?? []).find((s) => s.name === "--secondary")?.priority;
    const before = await priority();
    recordAcceptedSuggestion("mytool align --", { name: "--secondary" });
    expect(await priority()).toBe((before ?? 0) + 3);
  });

  test("an option accepted by its short name counts for the option, under its subcommand", async () => {
    setSessionEnvironment({ PATH: bin, CONDA_PREFIX: undefined });
    const priority = async () =>
      ((await runtime.getSuggestions("mytool align --", outsideAnyProject, Shell.Bash))?.suggestions ?? []).find((s) => s.name === "--preset")?.priority;
    const before = await priority();
    recordAcceptedSuggestion("mytool align -", { name: "-x" });
    expect(await priority()).toBe((before ?? 0) + 3);
  });

  test("--list shows it; --forget removes it and its Profiles", async () => {
    const list = capture();
    expect(await runLearn(["--list"], list.io)).toBe(0);
    expect(list.out.join("")).toMatch(/^mytool +align, index$/m);
    const forget = capture();
    expect(await runLearn(["--forget", "mytool"], forget.io)).toBe(0);
    const again = capture();
    await runLearn(["--list"], again.io);
    expect(again.out.join("")).toContain("no learned tool");
  });

  test("--forget on a Catalog Tool refuses, and keeps its Profiles", async () => {
    const opened = openUserStore({ create: true, file: store });
    opened?.putProfile({ tool: "fastp", version: "1.0", command: "", options: [], fingerprint: "f", createdAt: 0 });
    opened?.close();
    const { io } = capture();
    expect(await runLearn(["--forget", "fastp"], io)).toBe(1);
    const after = openUserStore({ create: false, file: store });
    expect(after?.listProfiles("fastp")).toHaveLength(1);
    after?.close();
  });

  test.each([
    [["fastp"], "fastp is in the Catalog"],
    [["nosuchtool"], "nosuchtool is not on your PATH"],
    [[], "tell which tool to learn"],
  ])("refuses %j clearly", async (args, message) => {
    const { err, io } = capture();
    expect(await runLearn(args, io)).toBe(1);
    expect(err.join("")).toContain(message);
  });

  test("a tool whose help cannot be read is refused, and nothing is stored", async () => {
    const silent = path.join(tempDir(), "bin");
    writeFakeTool(silent, "mute", {});
    const { err, io } = capture();
    expect(await runLearn(["mute"], { ...io, env: { PATH: silent } })).toBe(1);
    expect(err.join("")).toContain("could not read the help of mute");
    const list = capture();
    await runLearn(["--list"], list.io);
    expect(list.out.join("")).not.toContain("mute");
  });
});
