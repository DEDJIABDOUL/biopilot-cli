// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The --help parser on real recorded helps (knowledge/help), one style per tool (spec §7.3).

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { parseHelp, type HelpOption } from "../../../biopilot/profile/helpParser.js";

const helpDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..", "knowledge", "help");
const parse = (tool: string, version: string, file: string) => parseHelp(fs.readFileSync(path.join(helpDir, tool, version, file), "utf-8"));
const byName = (options: HelpOption[], name: string) => options.find((option) => option.names.includes(name));

describe("--help parser", () => {
  test("fastp 0.23.4 has --dedup, 0.20.1 does not", () => {
    expect(byName(parse("fastp", "0.23.4", "root.txt"), "--dedup")).toBeDefined();
    expect(byName(parse("fastp", "0.20.1", "root.txt"), "--dedup")).toBeUndefined();
  });

  test("fastp's cmdline style: aliases, and a value shown as `(type [=default])`", () => {
    const options = parse("fastp", "1.4.0", "root.txt");
    expect(byName(options, "-w")).toMatchObject({ names: ["-w", "--thread"], takesValue: true });
    expect(byName(options, "--dedup")).toMatchObject({ names: ["-D", "--dedup"], takesValue: false });
    expect(byName(options, "--thread")?.description).toMatch(/^worker thread number/);
  });

  test("argparse style (FastQC): `-c X, --contaminants X`, descriptions spanning lines", () => {
    const options = parse("fastqc", "0.13.0", "root.txt");
    expect(byName(options, "--contaminants")).toMatchObject({ names: ["-c", "--contaminants"], takesValue: true });
    expect(byName(options, "--extract")).toMatchObject({ takesValue: false });
    expect(byName(options, "--outdir")?.description).toMatch(/specified output\s+directory/);
    expect(byName(options, "files")).toBeUndefined();
  });

  test("htslib style (samtools): placeholders, long options alone with the description below", () => {
    const options = parse("samtools", "1.25", "sort.txt");
    expect(byName(options, "-o")).toMatchObject({ names: ["-o"], takesValue: true });
    expect(byName(options, "-n")).toMatchObject({ takesValue: false });
    expect(byName(options, "--no-PG")).toMatchObject({ takesValue: false, description: "Do not add a PG line" });
    expect(byName(options, "--threads")).toMatchObject({ names: ["-@", "--threads"], takesValue: true });
    expect(byName(options, "--output-fmt")).toMatchObject({ names: ["-O", "--output-fmt"], takesValue: true });
  });

  test("hand-written style (bwa): deep indentation, digits as names", () => {
    const options = parse("bwa", "0.7.19", "mem.txt");
    expect(byName(options, "-t")).toMatchObject({ takesValue: true, description: "number of threads [1]" });
    expect(byName(options, "-5")).toMatchObject({ takesValue: false });
    expect(options.map((option) => option.names[0])).not.toContain("-k17");
  });

  test("an optional value glued on, minimap2 style: `--cs[=STR]`", () => {
    expect(byName(parse("minimap2", "2.31", "root.txt"), "--cs")).toMatchObject({ names: ["--cs"], takesValue: true });
  });

  test("rich-click style (MultiQC): boxed lines, the short alias in its own column, `(TEXT)` for a value", () => {
    const options = parse("multiqc", "1.35", "root.txt");
    expect(byName(options, "--force")).toMatchObject({ names: ["--force", "-f"], takesValue: false });
    expect(byName(options, "--outdir")).toMatchObject({ names: ["--outdir", "-o"], takesValue: true });
    expect(byName(options, "--flat")).toMatchObject({ names: ["--flat", "-fp"] });
    expect(byName(options, "--version")).toMatchObject({ names: ["--version"], takesValue: false });
    expect(byName(options, "--template")).toMatchObject({ takesValue: true }); // `(default|disco|…)`
  });

  test("docopt style (mosdepth): names separated by a space, `-t --threads <threads>`", () => {
    const options = parse("mosdepth", "0.3.14", "root.txt");
    expect(byName(options, "--threads")).toMatchObject({ names: ["-t", "--threads"], takesValue: true });
    expect(byName(options, "--no-per-base")).toMatchObject({ names: ["-n", "--no-per-base"], takesValue: false });
  });

  test("filtlong style: the value's type glued to the name, `-t[int], --target_bases [int]`", () => {
    const options = parse("filtlong", "0.3.1", "root.txt");
    expect(byName(options, "--target_bases")).toMatchObject({ names: ["-t", "--target_bases"], takesValue: true });
    expect(byName(options, "--trim")).toMatchObject({ names: ["--trim"], takesValue: false });
    expect(options.flatMap((option) => option.names)).not.toContain("-tint");
  });

  test("Barclay style (Picard, GATK): unindented `--INPUT,-I <File>`, ANSI colours, the type glued to the description", () => {
    const options = parse("picard", "3.5.0", "SortSam.txt");
    expect(byName(options, "--INPUT")).toMatchObject({ names: ["--INPUT", "-I"], takesValue: true });
    expect(byName(options, "--INPUT")?.description).toMatch(/^The SAM, BAM or CRAM file to sort/);
    expect(byName(options, "--MAX_RECORDS_IN_RAM")).toMatchObject({ names: ["--MAX_RECORDS_IN_RAM"], takesValue: true });
    expect(byName(options, "--MAX_RECORDS_IN_RAM")?.description).toMatch(/^When writing files/);
    expect(byName(options, "--REFERENCE_SEQUENCE")).toMatchObject({ names: ["--REFERENCE_SEQUENCE", "-R"], takesValue: true });
    expect(byName(options, "--REFERENCE_SEQUENCE")?.description).toMatch(/^Reference sequence file/);
    expect(options).toHaveLength(18);
  });

  test("STAR style: `name   default` at the start of a line, the type and description indented below", () => {
    const options = parse("STAR", "2.7.11b", "root.txt");
    expect(byName(options, "--runThreadN")).toEqual({ names: ["--runThreadN"], takesValue: true, description: "number of threads to run STAR" });
    expect(byName(options, "--readFilesIn")).toMatchObject({ takesValue: true });
    expect(byName(options, "--outSJfilterOverhangMin")?.description).toMatch(/^minimum overhang length/);
    expect(byName(options, "--outReadsUnmapped")).toMatchObject({ takesValue: true }); // its type line is indented by 3
    expect(byName(options, "--alignSJstitchMismatchNmax")).toMatchObject({ takesValue: true }); // `4*int>=0:`
    expect(byName(options, "--outSJfilterIntronMaxVsReadN")).toMatchObject({ takesValue: true }); // `N integers>=0:`
    expect(options.flatMap((option) => option.names)).not.toContain("-1"); // `-1 ... all alignments`: a value
    expect(options).toHaveLength(203);
  });

  test("MEGAHIT style: the value in a column of its own, `-1      <pe1>      comma-separated…`", () => {
    const options = parse("megahit", "1.2.9", "root.txt");
    expect(byName(options, "-1")).toMatchObject({ names: ["-1"], takesValue: true });
    expect(byName(options, "-1")?.description).toMatch(/^comma-separated list/);
    expect(byName(options, "--read")).toMatchObject({ names: ["-r", "--read"], takesValue: true });
    expect(byName(options, "--k-list")).toMatchObject({ takesValue: true }); // `<int,int,..>`
    expect(byName(options, "--no-mercy")).toMatchObject({ takesValue: false });
  });

  test("QUAST style: unindented lines, the long name and its value in a column of their own", () => {
    const options = parse("quast", "5.3.0", "root.txt");
    expect(byName(options, "-o")).toMatchObject({ names: ["-o", "--output-dir"], takesValue: true });
    expect(byName(options, "-r")).toMatchObject({ names: ["-r"], takesValue: true });
    expect(byName(options, "--min-alignment")).toMatchObject({ names: ["-i", "--min-alignment"], takesValue: true });
    expect(byName(options, "--min-alignment")?.description).toMatch(/^The minimum alignment length/);
    expect(byName(options, "--eukaryote")).toMatchObject({ names: ["-e", "--eukaryote"], takesValue: false });
    expect(byName(options, "-L")).toMatchObject({ takesValue: false });
  });

  test("`--region[s]-file` gives both names", () => {
    expect(parseHelp("  -R, --region[s]-file FILE   restrict to regions\n")).toEqual([
      { names: ["-R", "--region-file", "--regions-file"], takesValue: true, description: "restrict to regions" },
    ]);
  });

  test("usage lines, titles and prose produce no option", () => {
    expect(parseHelp("Usage: tool [-h] [-o FILE] <in>\nOptions:\n\n  some prose - not an option\n  -- end of options\n")).toEqual([]);
    expect(parse("bwa", "0.7.19", "samse.txt")).toEqual([]);
  });
});
