// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The Catalog against its recorded helps: once a Profile is computed from a tool's own help, Catalog options the
// help does not list are dropped (spec §7.3), so every option of a Catalog command must be read from that
// command's recorded help, or the tool loses it on the user's machine.

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseHelp } from "../../../biopilot/profile/helpParser.js";

const knowledge = path.resolve("knowledge");

type YamlOption = { names: string[] };
type YamlCommand = { name: string; help?: string[]; options?: YamlOption[]; commands?: YamlCommand[] };
type Recording = { used_by_catalog?: boolean; files: Record<string, string> | { file: string; command: string }[] };

/** Options a help does not list, each with why the tool keeps them anyway (or why losing them is accepted). */
const NOT_IN_HELP: Record<string, string> = {
  // Listed in qualimap's root help only, for every tool; rank 40.
  "qualimap bamqc --java-mem-size": "global",
  "qualimap rnaseq --java-mem-size": "global",
  "qualimap multi-bamqc --java-mem-size": "global",
  "qualimap counts --java-mem-size": "global",
  "qualimap clustering --java-mem-size": "global",
  "qualimap comp-counts --java-mem-size": "global",
};

const versionsOf = (dir: string) =>
  fs.readdirSync(dir).filter((version) => (parse(fs.readFileSync(path.join(dir, version, "RECORDING.yml"), "utf-8")) as Recording).used_by_catalog !== false);

/** The Catalog commands with a help, the recording of that help, and the options the help's parse lacks. */
const lostOptions = (): { command: string; file: string | undefined; lost: string[] }[] => {
  const results: { command: string; file: string | undefined; lost: string[] }[] = [];
  for (const source of fs.readdirSync(path.join(knowledge, "tools")).sort()) {
    const tool = parse(fs.readFileSync(path.join(knowledge, "tools", source), "utf-8")) as YamlCommand;
    const helpDir = path.join(knowledge, "help", tool.name);
    if (!fs.existsSync(helpDir)) continue;
    for (const version of versionsOf(helpDir)) {
      const recording = parse(fs.readFileSync(path.join(helpDir, version, "RECORDING.yml"), "utf-8")) as Recording;
      const entries = Array.isArray(recording.files) ? recording.files.map(({ file, command }) => [file, command] as const) : Object.entries(recording.files);
      // `seqtk seq (in a terminal: …)`: the remark is not part of the command.
      const fileOf = new Map(
        entries.map(([file, command]) => [
          command
            .replace(/\s*\(.*\)\s*$/, "")
            .trim()
            .split(/\s+/)
            .slice(1)
            .join(" "),
          file,
        ]),
      );
      const walk = (command: YamlCommand, names: string[]) => {
        if (command.help !== undefined) {
          const file = fileOf.get(command.help.join(" "));
          const parsed = file ? parseHelp(fs.readFileSync(path.join(helpDir, version, file), "utf-8")) : [];
          const read = new Set(parsed.flatMap((option) => option.names));
          // An empty Profile keeps the Catalog's options: nothing is lost then.
          const lost =
            parsed.length === 0
              ? []
              : (command.options ?? []).filter((option) => !option.names.some((name) => read.has(name))).map((option) => option.names[0]);
          results.push({ command: [tool.name, ...names].join(" "), file: file && `${tool.name}/${version}/${file}`, lost });
        }
        for (const sub of command.commands ?? []) walk(sub, [...names, sub.name]);
      };
      walk(tool, []);
    }
  }
  return results;
};

describe("the Catalog against its recorded helps", () => {
  const results = lostOptions();

  test("there are commands to check", () => {
    expect(results.length).toBeGreaterThan(100);
  });

  test("every Catalog option of a command is read from the command's recorded help", () => {
    const lost = results.flatMap(({ command, lost }) => lost.map((option) => `${command} ${option}`)).filter((key) => !(key in NOT_IN_HELP));
    expect(lost).toEqual([]);
  });

  test("the exceptions are still needed", () => {
    const lost = new Set(results.flatMap(({ command, lost }) => lost.map((option) => `${command} ${option}`)));
    expect(Object.keys(NOT_IN_HELP).filter((key) => !lost.has(key))).toEqual([]);
  });
});
