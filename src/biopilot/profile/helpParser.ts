// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Reads the options a tool really offers from its own --help text (spec §7.3). Line-based and tolerant:
// a line that does not look like an option is skipped, so the parser never invents one. Styles covered:
// fastp's cmdline (`-i, --in1   desc (string [=])`), argparse (`-c X, --contaminants X`), htslib
// (`-o FILE   desc`, long options alone with the description on the next line), hand-written (bwa) and
// rich-click (MultiQC: boxed lines, the short alias in a column of its own, `(TEXT)` for a value).

/** An option as a tool's own --help describes it. */
export type HelpOption = { names: string[]; takesValue: boolean; description: string | null };

/** An option line: indentation, then a dash and a name character (`-@`, `-5`, `--in1`). */
const OPTION_LINE = /^(\s+)(--?[A-Za-z0-9@?][^\s]*.*)$/;
/** An option name, possibly with a value glued on (`--opt=VAL`, `--opt[=VAL]`) or `[s]` in its middle. */
// A bracket inside a name is a variant (`--region[s]-file`); at its end, the value's type (`-t[int]`, filtlong).
const NAME = /^(--?[A-Za-z0-9@?](?:[A-Za-z0-9_.@?-]|\[[a-z]+\](?=[A-Za-z0-9_.-]))*)(\[?=.*|\[[a-z]+\])?$/;
/** fastp's way to say an option takes a value: `(string [=])`, `(int [=4])` at the end of the description. */
const CMDLINE_VALUE = /\((?:string|int|long|float|double)(?: \[=[^\]]*\])?\)\s*$/;

/** rich-click's way: the value's kind in capitals, or its choices, at the end: `(TEXT)`, `(tsv|csv|json)`. */
const RICH_VALUE = /\((?:[A-Z][A-Z _-]*|[\w.-]+(?:\|[\w.-]+)+)\)\s*$/;
/** rich-click's alias column: the description starts with another name of the option, then two spaces. */
const ALIAS_COLUMN = /^(--?[A-Za-z0-9@?][A-Za-z0-9_.@?-]*)(?:\s{2,}(.*))?$/;
/** rich-click's box: `│ ` at the start of a line and ` │` at its end become spaces. */
const unbox = (line: string) => line.replace(/^(\s*)│/, "$1 ").replace(/\s*│\s*$/, "");
/** Terminal colour codes (Picard, GATK). */
// eslint-disable-next-line no-control-regex -- the escape character is what is matched
const ANSI = /\x1b\[[0-9;]*m/g;
/** Barclay (Picard, GATK): unindented `--INPUT,-I <File>`, the description after `>`, sometimes without a space. */
const BARCLAY_LINE = /^(--[A-Za-z][A-Za-z0-9_]*(?:,-[A-Za-z0-9_]+)?\s*<[^>]+>)(.*)$/;

/** `--region[s]-file` → `--region-file`, `--regions-file`. */
const expandBrackets = (name: string): string[] => {
  const match = name.match(/^(.*)\[([a-z]+)\](.*)$/);
  return match ? [`${match[1]}${match[3]}`, `${match[1]}${match[2]}${match[3]}`] : [name];
};

/**
 * The names and whether a value follows, from the option part of a line (before the description).
 * `undefined` when the part does not read as option names, e.g. prose starting with a dash.
 */
const readSpec = (spec: string): { names: string[]; takesValue: boolean } | undefined => {
  const names: string[] = [];
  let takesValue = false;
  for (const part of spec.split(/\s*[,/]\s*(?=-)/)) {
    const [first, ...rest] = part.trim().split(/\s+/);
    const match = first?.match(NAME);
    if (!match) return;
    names.push(...expandBrackets(match[1]));
    if (match[2] !== undefined) takesValue = true;
    for (const word of rest) {
      // docopt (mosdepth): more names after a space, `-t --threads <threads>`; anything else is the value.
      const more = word.startsWith("-") ? word.match(NAME) : null;
      if (more) {
        names.push(...expandBrackets(more[1]));
        if (more[2] !== undefined) takesValue = true;
      } else takesValue = true;
    }
  }
  return names.length > 0 ? { names, takesValue } : undefined;
};

/** Splits an option line into its option part and description, at the first run of two spaces (or a tab). */
const splitLine = (body: string): [string, string | null] => {
  const gap = body.search(/\s{2,}|\t/);
  return gap === -1 ? [body, null] : [body.slice(0, gap), body.slice(gap).trim() || null];
};

export const parseHelp = (text: string): HelpOption[] => {
  const options: HelpOption[] = [];
  const seen = new Set<string>();
  const lines = text.replace(ANSI, "").split(/\r?\n/).map(unbox);
  for (let i = 0; i < lines.length; i++) {
    const barclay = lines[i].match(BARCLAY_LINE);
    const line = barclay ? null : lines[i].match(OPTION_LINE);
    if (!barclay && !line) continue;
    const indent = line ? line[1].length : 0;
    const [specText, rest] = barclay ? [barclay[1], barclay[2].trim() || null] : splitLine(line![2]);
    const spec = readSpec(specText);
    if (!spec) continue;
    let inline = rest;
    const alias = rest?.match(ALIAS_COLUMN);
    if (alias) {
      spec.names.push(alias[1]);
      inline = alias[2]?.trim() || null;
    }
    // Continuation: following lines indented deeper that are not themselves options.
    const parts = inline ? [inline] : [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      if (next.trim() === "" || nextIndent <= indent || OPTION_LINE.test(next)) break;
      parts.push(next.trim());
      i++;
    }
    const description = parts.length > 0 ? parts.join(" ") : null;
    const takesValue = spec.takesValue || (description !== null && (CMDLINE_VALUE.test(description) || RICH_VALUE.test(description)));
    const names = spec.names.filter((name) => !seen.has(name));
    if (names.length === 0) continue; // the same option shown twice (e.g. in a summary): keep the first
    for (const name of names) seen.add(name);
    options.push({ names, takesValue, description });
  }
  return options;
};
