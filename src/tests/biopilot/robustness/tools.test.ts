// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// A misbehaving tool never freezes nor breaks BioPilot (ticket #65): a --help that hangs (also through a
// child process, like fastqc's wrapper starting java) is cut at 2.5 s; a flood of output is bounded.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveBinary } from "../../../biopilot/env/resolver.js";
import { runTool, TOOL_TIMEOUT_MS } from "../../../biopilot/env/version.js";
import { tempDir } from "../helpers.js";

/** A fake tool running this shell body. */
const tool = (body: string) => {
  const bin = path.join(tempDir(), "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "slow"), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  const binary = resolveBinary("slow", bin);
  if (!binary) throw new Error("test setup");
  return binary;
};

const timed = async (run: () => Promise<unknown>) => {
  const start = Date.now();
  const result = await run();
  return { result, ms: Date.now() - start };
};

/** Whether a process whose command line contains `marker` is still running. */
const running = (marker: string) => {
  try {
    return spawnSync("pgrep", ["-f", marker], { encoding: "utf-8" }).stdout.trim() !== "";
  } catch {
    return false;
  }
};

describe("a misbehaving tool", () => {
  test("a --help that hangs is cut at 2.5 s and gives nothing", async () => {
    const { result, ms } = await timed(() => runTool(tool("exec sleep 31"), ["--help"]));
    expect(result).toBeUndefined();
    expect(ms).toBeLessThan(TOOL_TIMEOUT_MS + 1_500);
  });

  test("…also when the hanging part is a child process: no process is left behind", async () => {
    const { result, ms } = await timed(() => runTool(tool("echo started; sleep 32; echo never"), ["--help"]));
    expect(result).toBeUndefined();
    expect(ms).toBeLessThan(TOOL_TIMEOUT_MS + 1_500);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(running("sleep 32")).toBe(false);
  });

  test("a flood of output is bounded and gives nothing", async () => {
    const { result, ms } = await timed(() => runTool(tool("head -c 20000000 /dev/zero | tr '\\\\0' 'x'"), ["--help"]));
    expect(result).toBeUndefined();
    expect(ms).toBeLessThan(TOOL_TIMEOUT_MS + 1_500);
  });

  test("a large but reasonable help is read", async () => {
    expect((await runTool(tool('i=0; while [ $i -lt 2000 ]; do echo "  --opt$i  option $i"; i=$((i+1)); done'), ["--help"]))?.length).toBeGreaterThan(30_000);
  });
});
