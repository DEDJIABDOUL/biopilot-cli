// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Implementation of `biopilot info`, loaded on demand by the command (see info.ts).
// BioPilot's own flags come before the tool name; every word after it is a subcommand path or an
// option name and is never parsed as a BioPilot flag (fastp itself has a `--json` option).

import chalk from "chalk";
import { openCatalog, type Catalog, type Command, type Option, type Tool } from "../knowledge/catalog.js";

/** Version of the `--json` output contract (schemas/info-output.schema.json). */
export const INFO_JSON_FORMAT = 1;

const USAGE = `Usage: biopilot info [--json] [tool] [command…] [option]

Shows what the BioPilot Catalog knows about a tool, one of its commands or one of its options.
BioPilot's flags go before the tool name; everything after it is read as a command path or an option name.

  biopilot info                   list the tools in the Catalog
  biopilot info fastp             show fastp and its options
  biopilot info fastp -i          show one option (any alias works)
  biopilot info --json fastp -i   the same, as JSON

Flags:
  --json      output JSON (format ${INFO_JSON_FORMAT})
  -h, --help  show this help
`;

export type InfoIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Explicit Catalog file; the standard locations are searched when omitted. */
  catalogPath?: string;
};

type Request = { json: boolean; help: boolean; tool?: string; path: string[]; option?: string };

const parseWords = (words: readonly string[]): Request | string => {
  const request: Request = { json: false, help: false, path: [] };
  let i = 0;
  for (; i < words.length && words[i].startsWith("-"); i++) {
    const flag = words[i];
    if (flag === "--json") request.json = true;
    else if (flag === "-h" || flag === "--help") request.help = true;
    else return `unknown flag "${flag}" (BioPilot's flags go before the tool name)`;
  }
  request.tool = words[i++];
  for (; i < words.length; i++) {
    const word = words[i];
    if (word.startsWith("-")) {
      if (request.option !== undefined) return `unexpected "${word}" after option "${request.option}"`;
      request.option = word;
    } else {
      if (request.option !== undefined) return `unexpected "${word}" after option "${request.option}"`;
      request.path.push(word);
    }
  }
  return request;
};

const toolJson = (tool: Tool) => ({
  name: tool.name,
  package: tool.package,
  description: tool.description,
  platforms: tool.platforms,
});

const commandJson = (command: Command) => ({ path: command.path, description: command.description });

const optionJson = (option: Option) => ({
  canonical_name: option.canonicalName,
  aliases: option.aliases,
  description: option.description,
  value: option.valueType === null ? null : { type: option.valueType },
  default: option.defaultValue,
  rank: option.rank,
});

const platformsText = (tool: Tool) => (tool.platforms.length > 0 ? tool.platforms.join(", ") : "generic");

const optionSignature = (option: Option) => {
  const others = option.aliases.filter((alias) => alias !== option.canonicalName);
  const names = [option.canonicalName, ...others].join(", ");
  return option.valueType === null ? names : `${names} <${option.valueType}>`;
};

const optionsText = (options: Option[]) => {
  const signatures = options.map(optionSignature);
  const width = Math.min(Math.max(0, ...signatures.map((s) => s.length)), 40);
  return options
    .map((option, i) => {
      const extras = [option.defaultValue !== null ? `default ${option.defaultValue}` : undefined, `rank ${option.rank}`].filter(Boolean).join(", ");
      return `  ${signatures[i].padEnd(width)}  ${option.description ?? ""} ${chalk.dim(`(${extras})`)}`.trimEnd();
    })
    .join("\n");
};

const run = (catalog: Catalog, request: Request, io: InfoIO): number => {
  const out = (value: unknown) => io.stdout(JSON.stringify({ format: INFO_JSON_FORMAT, ...(value as object) }, null, 2) + "\n");

  if (request.tool === undefined) {
    const tools = catalog.listTools();
    if (request.json) out({ tools: tools.map(toolJson) });
    else {
      const width = Math.max(0, ...tools.map((t) => t.name.length));
      io.stdout(tools.map((t) => `${chalk.bold(t.name.padEnd(width))}  ${platformsText(t).padEnd(18)}  ${t.description ?? ""}`.trimEnd()).join("\n") + "\n");
    }
    return 0;
  }

  const tool = catalog.getTool(request.tool);
  if (!tool) {
    io.stderr(`biopilot: unknown tool "${request.tool}" (not in the Catalog; "biopilot info" lists the known tools)\n`);
    return 1;
  }
  const command = catalog.getCommand(tool.name, request.path);
  if (!command) {
    io.stderr(`biopilot: unknown command "${[tool.name, ...request.path].join(" ")}"\n`);
    return 1;
  }
  const commandName = [tool.name, ...command.path].join(" ");

  if (request.option !== undefined) {
    const option = catalog.findOption(command, request.option);
    if (!option) {
      io.stderr(`biopilot: unknown option "${request.option}" for ${commandName}\n`);
      return 1;
    }
    if (request.json) out({ tool: toolJson(tool), command: commandJson(command), option: optionJson(option) });
    else io.stdout(`${chalk.bold(commandName)}\n${optionsText([option])}\n`);
    return 0;
  }

  const options = catalog.listOptions(command);
  if (request.json) out({ tool: toolJson(tool), command: commandJson(command), options: options.map(optionJson) });
  else {
    const header = [`${chalk.bold(commandName)}${tool.description ? ` — ${tool.description}` : ""}`, `platforms: ${platformsText(tool)}`];
    if (tool.package && tool.package !== tool.name) header.push(`package: ${tool.package}`);
    io.stdout(`${header.join("\n")}\n\noptions:\n${optionsText(options)}\n`);
  }
  return 0;
};

/** Runs `biopilot info` on raw words (everything after `info`). Returns the exit code. */
export const runInfo = (words: readonly string[], io: InfoIO): number => {
  const request = parseWords(words);
  if (typeof request === "string") {
    io.stderr(`biopilot: ${request}\n\n${USAGE}`);
    return 1;
  }
  if (request.help) {
    io.stdout(USAGE);
    return 0;
  }
  const opened = openCatalog(io.catalogPath);
  if (!opened.available) {
    io.stderr(`biopilot: the Catalog is unavailable: ${opened.detail}\nrun "biopilot doctor" for details\n`);
    return 1;
  }
  try {
    return run(opened.catalog, request, io);
  } finally {
    opened.catalog.close();
  }
};
