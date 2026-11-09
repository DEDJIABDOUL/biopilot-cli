// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `npm run demo` (ticket #104): records docs/demo/demo.gif. The scene (scripts/demo/scene.ts) is played in
// a real BioPilot session in a pseudo-terminal, recorded as an asciicast, and rendered by agg
// (asciinema-agg, `conda install -c conda-forge asciinema-agg`). No browser is involved, unlike VHS, whose
// headless Chromium a system restricting unprivileged user namespaces (Ubuntu 24.04) does not start.
// It runs in a throwaway folder: a project like the spec's annex C, a fake conda environment `rnaseq`
// whose fastp and bwa answer with their recorded helps, and its own HOME, settings and User store, so that
// nothing of the machine's own files, prompt or tools shows. Build first: `npm run build:db && npm run build`.
// `--keep-cast` keeps docs/demo/demo.cast; `--screens` prints the screen at each step instead of rendering.

import { spawnSync } from "node:child_process";
import pty from "node-pty";
import xterm from "@xterm/headless";
import { scene } from "./scene.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..", "..");
const entry = path.join(repo, "build", "index.js");
const catalog = path.join(repo, "build", "knowledge.db");
for (const built of [entry, catalog])
  if (!fs.existsSync(built)) throw new Error(`${path.relative(repo, built)} is missing: run npm run build:db && npm run build first`);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-demo-"));
const write = (file: string, content = "", mode?: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode === undefined ? undefined : { mode });
};

// The project: read pairs of two samples, a results folder, a reference indexed by bwa.
const project = path.join(root, "rnaseq-project");
write(path.join(project, ".git", "HEAD"), "ref: refs/heads/main\n");
for (const file of ["ctrl_R1.fastq.gz", "ctrl_R2.fastq.gz", "treat_R1.fastq.gz", "treat_R2.fastq.gz"]) write(path.join(project, "data", file));
fs.mkdirSync(path.join(project, "results"), { recursive: true });
for (const suffix of ["", ".amb", ".ann", ".bwt", ".pac", ".sa", ".fai"]) write(path.join(project, "ref", `genome.fa${suffix}`));

// The conda environment: conda-meta records and tools answering their help and version commands.
const prefix = path.join(root, "miniconda3", "envs", "rnaseq");
const bin = path.join(prefix, "bin");
const tool = (name: string, version: string, responses: Record<string, string>) => {
  write(path.join(prefix, "conda-meta", `${name}-${version}-h0_1.json`), JSON.stringify({ name, version, build: "h0_1" }));
  const cases = Object.entries(responses).map(([args, file]) => `  "${args}") cat '${file}' ;;`);
  write(path.join(bin, name), `#!/bin/sh\ncase "$*" in\n${cases.join("\n")}\n  *) exit 1 ;;\nesac\n`, 0o755);
};
const help = (name: string, version: string, file: string) => path.join(repo, "knowledge", "help", name, version, file);
const fastpHelp = help("fastp", "0.23.4", "root.txt");
const fastpVersion = path.join(root, "fastp-version.txt");
write(fastpVersion, "fastp 0.23.4\n");
tool("fastp", "0.23.4", { "--help": fastpHelp, "--version": fastpVersion });
const bwaFiles = fs.readdirSync(path.join(repo, "knowledge", "help", "bwa", "0.7.19")).filter((f) => f.endsWith(".txt"));
tool("bwa", "0.7.19", Object.fromEntries(bwaFiles.map((f) => [f === "root.txt" ? "" : f.slice(0, -4), help("bwa", "0.7.19", f)])));
write(path.join(bin, "biopilot"), `#!/bin/sh\nexec '${process.execPath}' '${entry}' "$@"\n`, 0o755);

// A home of its own: a plain prompt, the start line, no history.
const home = path.join(root, "home");
write(path.join(home, ".bashrc"), `PS1='\\[\\e[1;32m\\](rnaseq)\\[\\e[0m\\] \\[\\e[1;34m\\]$\\[\\e[0m\\] '\nunset HISTFILE\n`);

const env: NodeJS.ProcessEnv = {
  // The demo's tools, node, the system: nothing of the machine's own environments.
  PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
  HOME: home,
  SHELL: "/bin/bash",
  TERM: "xterm-256color",
  LANG: process.env.LANG ?? "C.UTF-8",
  CONDA_PREFIX: prefix,
  CONDA_DEFAULT_ENV: "rnaseq",
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_DATA_HOME: path.join(root, "data"),
  BIOPILOT_CATALOG: catalog,
  DEMO_PROJECT: project,
};

// The Profiles of fastp and bwa, read ahead: the status line shows no "reading its real options…".
// Its resources in the fresh data folder, as install.sh does.
const reinit = spawnSync(process.execPath, [entry, "reinit"], { env, cwd: repo, encoding: "utf-8" }); // from the source tree
if (reinit.status !== 0) throw new Error(`biopilot reinit failed: ${reinit.stdout}${reinit.stderr}`);
// (It reports the other Catalog tools as not installed, with a non-zero exit code: expected here.)
spawnSync(process.execPath, [entry, "sync"], { env, cwd: project, stdio: "ignore" });
const COLS = 120;
const ROWS = 20;
const cast = path.join(repo, "docs", "demo", "demo.cast");
const gif = path.join(repo, "docs", "demo", "demo.gif");
const screens = process.argv.includes("--screens");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const term = pty.spawn(path.join(bin, "biopilot"), ["-s", "bash"], {
  name: "xterm-256color",
  cols: COLS,
  rows: ROWS,
  cwd: project,
  env: env as Record<string, string>,
});
const screen = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
const events: [number, "o", string][] = [];
let start: number | undefined;
let output = "";
term.onData((data) => {
  output += data;
  screen.write(data);
  if (start !== undefined) events.push([(Date.now() - start) / 1000, "o", data]);
});
const show = (label: string) => {
  const buffer = screen.buffer.active;
  const lines = Array.from({ length: ROWS }, (_, y) => buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? "");
  console.log(`--- ${label}\n${lines.join("\n").trimEnd()}`);
};
const waitFor = async (text: RegExp, ms: number) => {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(50)) if (text.test(output)) return;
  throw new Error(`the session did not show ${text}; it showed:\n${output.slice(-2000)}`);
};

await waitFor(/6973;PE/, 15_000); // the end of the prompt, as the shell integration marks it
// Recorded from the screen clear on: the first frame is the prompt alone, without `clear` being typed.
output = "";
start = Date.now();
term.write("clear\r");
await sleep(800);
const KEYS = { tab: "\t", enter: "\r", down: "\x1b[B" } as const;
for (const [i, step] of scene.entries()) {
  if ("wait" in step) await sleep(step.wait);
  else if ("key" in step) term.write(KEYS[step.key]);
  else
    for (const char of step.type) {
      term.write(char);
      await sleep(75);
    }
  if (screens && !("wait" in step)) {
    await sleep(400);
    show(`step ${i}: ${JSON.stringify(step)}`);
  }
}
term.kill();
if (screens) process.exit(0);

const cleared = events.findIndex(([, , data]) => data.includes("\x1b[2J"));
if (cleared < 0) throw new Error("the screen was never cleared");
const t0 = events[cleared][0];
const recorded = events
  .slice(cleared)
  .map(([t, kind, data], i): [number, "o", string] => [Number((t - t0).toFixed(3)), kind, i === 0 ? data.slice(data.indexOf("\x1b[2J")) : data]);
fs.writeFileSync(
  cast,
  [
    JSON.stringify({ version: 2, width: COLS, height: ROWS, env: { TERM: "xterm-256color", SHELL: "/bin/bash" } }),
    ...recorded.map((event) => JSON.stringify(event)),
  ].join("\n") + "\n",
);
const agg = spawnSync(
  "agg",
  [
    "--font-size",
    "16",
    "--font-family",
    "DejaVu Sans Mono,Noto Color Emoji",
    "--theme",
    "monokai",
    "--idle-time-limit",
    "2.5",
    "--last-frame-duration",
    "4",
    cast,
    gif,
  ],
  { stdio: "inherit" },
);
if (agg.error || agg.status !== 0) throw new Error(`agg failed${agg.error ? `: ${agg.error.message}` : ""} (conda install -c conda-forge asciinema-agg)`);
if (!process.argv.includes("--keep-cast")) fs.rmSync(cast);
console.log(`${path.relative(repo, gif)}: ${(fs.statSync(gif).size / 1024 / 1024).toFixed(2)} MB`);
fs.rmSync(root, { recursive: true, force: true });
