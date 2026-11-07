// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The subcommands a tool's root help lists (spec §6.4, `biopilot learn`): one level, 50 at most. Styles
// covered: htslib (`Commands:` then `-- Section` lines and blank lines: samtools, bcftools), bwa
// (`Command: index …` on the header line), clap (`Commands:` then `  name  description`: salmon).

export type HelpSubcommand = { name: string; description: string | null };

/** Spec §6.4: discovery stops at 50 subcommands. */
export const MAX_SUBCOMMANDS = 50;

/** A command list's header; group 1 is what follows it on the same line (bwa). */
const HEADER = /^\s*(?:available\s+)?(?:sub)?commands?\s*:\s*(.*)$/i;
/** `name   description`: a lowercase word, then two spaces or more. */
const ENTRY = /^\s*([a-z][\w.-]*)(?:\s{2,}(\S.*))?$/;
/** `-- Indexing`: a section title inside the list. */
const SECTION = /^\s*--\s+\S/;
/** Entries that are no subcommand to learn. */
const SKIPPED = new Set(["help"]);

export const parseSubcommands = (text: string): HelpSubcommand[] => {
  const found: HelpSubcommand[] = [];
  const seen = new Set<string>();
  let inList = false;
  const add = (line: string) => {
    const entry = line.match(ENTRY);
    if (!entry || !entry[2] || SKIPPED.has(entry[1]) || seen.has(entry[1])) return;
    seen.add(entry[1]);
    found.push({ name: entry[1], description: entry[2].trim() });
  };
  for (const line of text.split(/\r?\n/)) {
    if (found.length >= MAX_SUBCOMMANDS) break;
    const header = line.match(HEADER);
    if (header) {
      inList = true;
      if (header[1].trim()) add(header[1]);
      continue;
    }
    if (!inList) continue;
    if (line.trim() === "" || SECTION.test(line)) continue;
    // A line back at the margin ends the list (the next section: `Options:`, prose).
    if (!/^\s/.test(line)) {
      inList = false;
      continue;
    }
    add(line);
  }
  return found.slice(0, MAX_SUBCOMMANDS);
};
