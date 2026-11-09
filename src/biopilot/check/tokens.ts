// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Splits a shell command line into simple commands and their words, as `biopilot check` needs them:
// quotes and backslashes resolved, pipelines and lists split, redirections and their targets dropped.
// Nothing is expanded except a leading `~/`, which the caller resolves. Never throws.

export type Words = string[];
export type Tokenized = { ok: true; commands: Words[] } | { ok: false; reason: string };

/** Operators that end a simple command. */
const SEPARATORS = new Set(["|", "||", "&&", ";", "&", "|&"]);
/** A redirection operator, possibly with a file descriptor: `>`, `2>`, `>>`, `&>`, `<`, `2>&1`, `>out.txt`… */
const REDIRECTION = /^(\d*|&)(>>?|<|>&|<&)(.*)$/;

type Token = { text: string; quoted: boolean };

const lex = (line: string): Token[] | string => {
  const tokens: Token[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  const push = () => {
    if (started) tokens.push({ text: current, quoted });
    current = "";
    started = false;
    quoted = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return "unterminated single quote";
      current += line.slice(i + 1, end);
      started = quoted = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < line.length && line[j] !== '"'; j++) {
        if (line[j] === "\\" && j + 1 < line.length && '"\\$`'.includes(line[j + 1])) j++;
        current += line[j];
      }
      if (j >= line.length) return "unterminated double quote";
      started = quoted = true;
      i = j;
    } else if (c === "\\") {
      if (i + 1 < line.length) current += line[++i];
      started = true;
    } else if (c === " " || c === "\t" || c === "\n") {
      push();
    } else if (c === "#" && !started) {
      break; // a comment
    } else if ("|&;".includes(c)) {
      // `2>&1` and `&>` are redirections, not separators.
      if (c === "&" && (current.endsWith(">") || current.endsWith("<") || line[i + 1] === ">")) {
        current += c;
        started = true;
        continue;
      }
      push();
      const two = line.slice(i, i + 2);
      const op = SEPARATORS.has(two) ? two : c;
      tokens.push({ text: op, quoted: false });
      i += op.length - 1;
    } else {
      current += c;
      started = true;
    }
  }
  push();
  return tokens;
};

/** The simple commands of a line, each as its words; redirections and their targets removed. */
export const tokenize = (line: string): Tokenized => {
  const tokens = lex(line);
  if (typeof tokens === "string") return { ok: false, reason: tokens };
  const commands: Words[] = [];
  let words: Words = [];
  for (let i = 0; i < tokens.length; i++) {
    const { text, quoted } = tokens[i];
    if (!quoted && SEPARATORS.has(text)) {
      if (words.length > 0) commands.push(words);
      words = [];
      continue;
    }
    const redirection = quoted ? null : REDIRECTION.exec(text);
    if (redirection) {
      // `> file`: the target is the next word; `>file` or `2>&1`: already attached.
      if (redirection[3] === "") i++;
      continue;
    }
    words.push(text);
  }
  if (words.length > 0) commands.push(words);
  return { ok: true, commands };
};
