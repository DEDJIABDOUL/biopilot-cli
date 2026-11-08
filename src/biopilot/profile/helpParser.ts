// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Reads the options a tool really offers from its own --help text (spec §7.3). Line-based and tolerant:
// a line that does not look like an option is skipped, so the parser never invents one. Styles covered:
// fastp's cmdline (`-i, --in1   desc (string [=])`), argparse (`-c X, --contaminants X`), htslib
// (`-o FILE   desc`, long options alone with the description on the next line), hand-written (bwa) and
// rich-click (MultiQC: boxed lines, the short alias in a column of its own, `(TEXT)` for a value).
// Options the help names only on its usage line (`bowtie2 … -x <bt2-idx> {-1 <m1> …}`) are read from it too.

/**
 * The version of this reader, raised whenever it reads a help differently: Profiles stored by an earlier one are
 * computed again (userStore). 2: usage-line options, bcftools pairs, `Options: -a` (1.1.1).
 */
export const HELP_READER_VERSION = 2;

/** An option as a tool's own --help describes it. */
export type HelpOption = { names: string[]; takesValue: boolean; description: string | null };

/** An option line: indentation, then a dash and a name character (`-@`, `-5`, `--in1`). */
const OPTION_LINE = /^(\s*)(--?[A-Za-z0-9@?*][^\s]*.*)$/;
/** An option name, possibly with a value glued on (`--opt=VAL`, `--opt[=VAL]`) or `[s]` in its middle. */
// A bracket is a variant (`--region[s]-file`, `--color[s]`), unless it ends the name and names a value's type
// (`-t[int]`, filtlong).
const VALUE_TYPE = "(?:int|integer|float|double|long|num|number|str|string|file|path|dir)";
const NAME = new RegExp(`^(--?[A-Za-z0-9@?*](?:[A-Za-z0-9_.@?+-]|\\[(?!${VALUE_TYPE}\\]$)[a-z]+\\](?=[A-Za-z0-9_.-]|$))*)(\\[?=.*|\\[${VALUE_TYPE}\\])?$`);
/** fastp's way to say an option takes a value: `(string [=])`, `(int [=4])` at the end of the description. */
const CMDLINE_VALUE = /\((?:string|int|long|float|double)(?: \[=[^\]]*\])?\)\s*$/;

/** rich-click's way: the value's kind in capitals, or its choices, at the end: `(TEXT)`, `(tsv|csv|json)`. */
const RICH_VALUE = /\((?:[A-Z][A-Z _-]*|[\w.-]+(?:\|[\w.-]+)+)\)\s*$/;
/** rich-click's alias column: the description starts with another name of the option, then two spaces. */
const ALIAS_COLUMN = /^(--?[A-Za-z0-9@?][A-Za-z0-9_.@?-]*)(?:\s{2,}(.*))?$/;
/** MEGAHIT: the value in a column of its own, between the names and the description: `<pe1>   comma-…`. */
const VALUE_COLUMN = /^<[^>\s]+>(?:\s{2,}(.*))?$/;
/** rich-click's box: `│ ` at the start of a line and ` │` at its end become spaces. */
const unbox = (line: string) => line.replace(/^(\s*)│/, "$1 ").replace(/\s*│\s*$/, "");
/** Terminal colour codes (Picard, GATK). */
// eslint-disable-next-line no-control-regex -- the escape character is what is matched
const ANSI = /\x1b\[[0-9;]*m/g;
/** STAR: `runThreadN   1` at the start of a line, an option typed with `--` before its name. */
const STAR_NAME = /^([a-z][A-Za-z0-9]+)\s+\S/;
/** STAR: the line below the name, its value's type then its description, `    int>0: number of…`, `    4 integers: …`. */
const STAR_TYPE = /^\s{3,}(?:(?:\d+|N)\s+|\d+\*)?(?:string|int|uint|real|double|integer)[a-z]*(?:\(s\))?(?:\s*[<>=][^:]*)?(?:,[^:]*)?:\s*(.*)$/;
/** Barclay (Picard, GATK): unindented `--INPUT,-I <File>`, the description after `>`, sometimes without a space. */
const BARCLAY_LINE = /^(--[A-Za-z][A-Za-z0-9_]*(?:,-[A-Za-z0-9_]+)?\s*<[^>]+>)(.*)$/;

/** A heading glued to the first option (bwa, seqtk): `Options: -a STR   …`. Replaced by spaces, so the column stays. */
const OPTIONS_HEADING = /^(?:Options|Opts)\s*:\s+(?=-)/i;
/** bcftools: two options on one line, `-i/e, --include/--exclude EXPR`, `-k/n, --known/--novel`. */
const SLASH_PAIR = /^-([A-Za-z0-9])\/([A-Za-z0-9]),\s+(--[A-Za-z0-9][\w.+-]*)\/(--[A-Za-z0-9][\w.+-]*)(\s+\S.*)?$/;
/** The start of a usage block: `Usage:`, `usage: tool …`, `USAGE: …`. */
const USAGE_START = /^\s*usage\s*:/i;
/** An option name in a usage line, once brackets, braces and parentheses are stripped. */
const USAGE_NAME = /^--?[A-Za-z0-9](?:[\w.+-]*[A-Za-z0-9+])?$/;

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
    // `-1 ... all alignments`: a value in a list of values (STAR), not an option.
    if (rest[0] === "...") return;
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

/**
 * Options named on the usage lines (`Usage:` up to the next blank line), with whether a value follows
 * (`-x <bt2-idx>`, `-s seed=11`, `-i [SEQUENCE_FILE]`), but not a flag closing its group (`[-quiet]`) or
 * one of alternatives (`[-phred33|-phred64]`).
 */
const usageOptions = (lines: readonly string[]): { names: string[]; takesValue: boolean }[] => {
  const found: { names: string[]; takesValue: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!USAGE_START.test(lines[i])) continue;
    // The block runs to the next blank line. A line of it counts when it starts a usage (after `or:`, or the
    // first one), names the same program again, or continues a wrapped one (`[`, `{`, `(`, `<`, `-`): an
    // example piped from another command (`find dir -type f … | samtools samples`) does not.
    const block: string[] = [];
    let program: string | undefined;
    let starts = true;
    for (let line = lines[i].replace(USAGE_START, ""); ; line = lines[++i]) {
      const first = line.trim().split(/\s+/)[0] ?? "";
      if (/^or:?$/i.test(line.trim())) starts = true;
      else if (first !== "") {
        if (starts) [program, starts] = [first, false];
        if (first === program || /^[[{(<-]/.test(first) || block.length === 0) block.push(line);
      }
      // A heading (`Options:`) ends it too: samtools stats has no blank line before its options.
      if (i + 1 >= lines.length || lines[i + 1].trim() === "" || /^\s*(?!or:)[A-Za-z][^:]*:\s*$/i.test(lines[i + 1])) break;
    }
    const words = block.join(" ").split(/\s+/).filter(Boolean);
    for (let w = 0; w < words.length; w++) {
      // `[-phred33|-phred64]`: alternatives, flags; `-x <idx>`: a value; `[-quiet]`: a flag closing its group.
      const alternatives = words[w].includes("|");
      for (const part of words[w].split("|")) {
        const name = part.replace(/^[[{(]+/, "").replace(/[\]})]+\.*$|\.\.\.$/, "");
        if (!USAGE_NAME.test(name)) continue;
        const next = words[w + 1];
        const takesValue = !alternatives && !/[\]})]/.test(part) && next !== undefined && !/^[[{(]*-|^[|\]})]/.test(next);
        found.push({ names: [name], takesValue });
      }
    }
  }
  return found;
};

/** The description of an option: its inline part, then the following lines indented deeper that are not options. */
const continuation = (lines: readonly string[], i: number, indent: number, inline: string | null): [string | null, number] => {
  const parts = inline ? [inline] : [];
  while (i + 1 < lines.length) {
    const next = lines[i + 1];
    const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
    if (next.trim() === "" || nextIndent <= indent || OPTION_LINE.test(next)) break;
    parts.push(next.trim());
    i++;
  }
  return [parts.length > 0 ? parts.join(" ") : null, i];
};

export const parseHelp = (text: string): HelpOption[] => {
  const options: HelpOption[] = [];
  const seen = new Set<string>();
  const add = (names: string[], takesValue: boolean, description: string | null) => {
    const unseen = names.filter((name) => !seen.has(name));
    if (unseen.length === 0) return; // the same option shown twice (e.g. in a summary): keep the first
    for (const name of unseen) seen.add(name);
    options.push({ names: unseen, takesValue, description });
  };
  const lines = text
    .replace(ANSI, "")
    .split(/\r?\n/)
    .map(unbox)
    .map((line) => line.replace(OPTIONS_HEADING, (heading) => " ".repeat(heading.length)));
  for (let i = 0; i < lines.length; i++) {
    const star = lines[i].match(STAR_NAME);
    const starType = star && i + 1 < lines.length ? lines[i + 1].match(STAR_TYPE) : null;
    if (star && starType) {
      const name = `--${star[1]}`;
      if (!seen.has(name)) {
        seen.add(name);
        options.push({ names: [name], takesValue: true, description: starType[1].trim() || null });
      }
      i++;
      continue;
    }
    const barclay = lines[i].match(BARCLAY_LINE);
    const line = barclay ? null : lines[i].match(OPTION_LINE);
    if (!barclay && !line) continue;
    const indent = line ? line[1].length : 0;
    const [specText, rest] = barclay ? [barclay[1], barclay[2].trim() || null] : splitLine(line![2]);
    // Unindented (QUAST): only with a column after the names, so that wrapped prose at the margin
    // (`--polish-target option.`) is not read as an option.
    if (!barclay && indent === 0 && rest === null) continue;
    const pair = barclay ? null : specText.match(SLASH_PAIR);
    if (pair) {
      const [description, last] = continuation(lines, i, indent, rest);
      i = last;
      add([`-${pair[1]}`, pair[3]], pair[5] !== undefined, description);
      add([`-${pair[2]}`, pair[4]], pair[5] !== undefined, description);
      continue;
    }
    // `-f,   --apply-filters LIST` (bcftools): the short name alone before the column, with its comma.
    const spec = readSpec(specText.replace(/,$/, ""));
    // `-1  ... default compression` (STAR): a value in a list of values, not an option.
    if (!spec || (rest?.startsWith("...") && spec.names.every((name) => /^-\d+$/.test(name)))) continue;
    let inline = rest;
    const alias = rest?.match(ALIAS_COLUMN);
    if (alias) {
      spec.names.push(alias[1]);
      inline = alias[2]?.trim() || null;
    } else if (rest?.startsWith("-")) {
      // QUAST: the long name in a column of its own, with its value: `-i  --min-alignment <int>   The minimum…`.
      const [aliasText, aliasRest] = splitLine(rest);
      const more = aliasRest !== null ? readSpec(aliasText) : undefined;
      if (more && more.names.every((name) => name.startsWith("--"))) {
        spec.names.push(...more.names);
        spec.takesValue ||= more.takesValue;
        inline = aliasRest;
      }
    }
    const valueColumn = inline?.match(VALUE_COLUMN);
    if (valueColumn) {
      spec.takesValue = true;
      inline = valueColumn[1]?.trim() || null;
    }
    const [description, last] = continuation(lines, i, indent, inline);
    i = last;
    const takesValue = spec.takesValue || (description !== null && (CMDLINE_VALUE.test(description) || RICH_VALUE.test(description)));
    add(spec.names, takesValue, description);
  }
  // Options only the usage line names (bowtie2's -x, bedtools' -a and -b, Trimmomatic's -threads). A single-dash
  // name of several characters starting with a known option is a bundle of flags (`[-eubrAESQ]`) or a value
  // glued on (`-q0`, `-xsr`), not an option.
  const known = new Set(options.flatMap((option) => option.names));
  for (const option of usageOptions(lines)) {
    const [name] = option.names;
    if (known.has(name) || (/^-[^-]./.test(name) && known.has(name.slice(0, 2)))) continue;
    // `[-ve]` (samtools cram-size): two or three letters without a value are flags bundled together.
    if (/^-[A-Za-z]{2,3}$/.test(name) && !option.takesValue) for (const letter of name.slice(1)) add([`-${letter}`], false, null);
    else add(option.names, option.takesValue, null);
  }
  // bowtie2, hisat2: `for --un, --al, … add '-gz' to the option name, … or add '-bz2'`: the compressed variants.
  const note = lines
    .join(" ")
    .replace(/\s+/g, " ")
    .match(/for ((?:--[\w-]+,? (?:or )?)+)add '(-\w+)' to the option name[^)]*?(?:or add '(-\w+)'|\))/);
  if (note)
    for (const base of note[1].match(/--[\w-]+/g) ?? [])
      for (const suffix of [note[2], note[3]].filter((s): s is string => s !== undefined)) add([`${base}${suffix}`], true, null);
  return options;
};
