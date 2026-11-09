# Adding a tool to the Catalog

The Catalog is what BioPilot knows about bioinformatics tools before it has read their own `--help`: options, subcommands, value types, file formats, read pairs, derived outputs and ranks. It is written as one YAML file per tool in [`knowledge/tools/`](../knowledge/tools/), validated against [`schemas/tool.schema.json`](../schemas/tool.schema.json) and compiled into `knowledge.db` at build time. This guide walks through adding one. The full format is in annex B of the [specification](../biopilot-cli-cahier-des-charges.md) (French).

## 1. Record the tool's help

From a conda environment holding the tool (the maintainers use one named `biopilot-tools`, bioconda + conda-forge, linux-64), save the raw output of each help command — stdout and stderr together, never edited — under `knowledge/help/<tool>/<version>/`, one file per command (`root.txt`, `sort.txt`…), with a `RECORDING.yml`:

```yaml
# knowledge/help/fastp/1.4.0/RECORDING.yml
tool: fastp
package: fastp
version: 1.4.0
build: h43da1c4_0
channel: bioconda
licence: MIT
copyright: fastp authors (Shifu Chen et al.), https://github.com/OpenGene/fastp
recorded_on: 2026-11-06
platform: linux-64
conda_env: biopilot-tools
used_by_catalog: true          # false for versions kept as test data only
files:
  root.txt: fastp --help       # file: the command that printed it
```

These recordings are test data (the `--help` parser is tested on them) and the reference you write the YAML from. They stay under the tool's licence, credited above.

## 2. Write `knowledge/tools/<tool>.yml`

```yaml
# yaml-language-server: $schema=../../schemas/tool.schema.json
name: bwa
package: bwa                      # conda package name (conda-meta/); the tool's name when omitted
description: maps short reads to a reference genome
platforms: [illumina]             # illumina, nanopore; omit for a generic tool
version: { args: [], regex: 'Version: (\d[\w.-]*)' }   # one capture group: the version
help: []                          # arguments printing the root help
commands:
  - name: mem
    help: ["mem"]
    description: align reads with the BWA-MEM algorithm
    options:
      - names: ["-t"]
        description: number of threads
        value: { type: int }
        default: 1
        rank: 85
    arguments:
      - name: idxbase
        value: { type: file, format: bwa-index }
      - name: in1.fq
        value: { type: file, format: fastq, read_role: 1 }
      - name: in2.fq
        value: { type: file, format: fastq, read_role: 2, mate_of: in1.fq, optional: true }
```

Write **descriptions in your own words**: never copy them from the `--help` (several tools are GPL-licensed).

### Options

| Field | Meaning |
|---|---|
| `names` | every name of the option (`["-i", "--in1"]`); the first long one is the canonical name |
| `value` | what follows the option; absent for a flag |
| `value.type` | `int`, `float`, `string`, `file`, `dir`, `enum` |
| `value.format` | a format of [`knowledge/formats.yml`](../knowledge/formats.yml) (or a list, most common first); type `file` or `dir` only |
| `value.values` | suggested values; the only allowed ones for `enum` (`[fast, slow]` or `{ value, description }`) |
| `value.optional`, `value.multiple` | `--opt[=VAL]`; several values follow |
| `value.read_role`, `value.mate_of` | read 1 or 2 of a pair, and the option holding its mate (`mate_of: "--in1"`) |
| `value.derive` | a derived output: `{ from: "--in1", suffix: ".trimmed" }` offers `results/x_R1.trimmed.fastq.gz` |
| `value.io` | `input` or `output`, for a file or folder: what `biopilot check` verifies (a missing input, an output folder that does not exist, an output equal to an input). Give it to the main inputs and outputs; omit it when it depends on the mode (STAR's `--genomeDir`). A derived output is an output |
| `threads` | `true` on an `int` option that sets a number of threads, CPUs, cores or workers: `biopilot check` compares it with the CPUs available |
| `default` | the tool's default, for `biopilot info` |
| `rank` | 0–100, see below; 50 when omitted |
| `since`, `until` | the first and last tool versions that have the option: options outside are hidden for a detected version |
| `rules` | context boosts, see below |
| `repeatable`, `hidden`, `deprecated` | may be given several times; never suggested (but understood on the line); suggested last |

### Rank scale

| Rank | For |
|---|---|
| 90–100 | main inputs and outputs, reference |
| 70–89 | options set very often (threads, preset, output format) |
| 50 | default |
| 30–49 | fine tuning |
| 10–29 | rare, debugging or obsolete options |

Proposed ranks are reviewed by someone who uses the tool before merging.

### Rules

A rule adds `boost` (−100 to +100) to an option's rank when every field of `when` holds:

```yaml
rules:
  - when: { used: ["--in1"], paired: true }   # once --in1 is on the line, in a project with read pairs
    boost: 35
  - when: { platform: nanopore }               # in a nanopore project
    boost: -20
```

`used` lists options of the same command (any alias); `paired` is `true`/`false`; `platform` is `illumina` or `nanopore`; `assay` is `rna-seq`, `variant-calling` or `unknown`.

### Subcommands and arguments

`commands` nests subcommands (each with its own `help`, `options`, `arguments`, `commands`). `arguments` are positional, in order; only the last may be `variadic`; their `value` works as for options (`mate_of` names another argument).

### Formats

A new file format goes in `knowledge/formats.yml`: `kind: file` with a `pattern` (matched against the file name, case-insensitively), `kind: prefix` with the `suffixes` of an index named after its reference (bwa), or `kind: dir` with a `marker` file identifying an index folder (salmon).

## 3. Build and test

```shell
npm run build:db   # validates every YAML (errors give file, location and line), compiles build/knowledge.db
npm test           # includes the compilation of the repository's tools and the --help parser on the recordings
biopilot info <tool>   # or: node build/index.js info <tool> after npm run build
```

A test that compiles the repository's knowledge fails on any invalid file, so CI refuses it too. If the tool's `--help` has a style the parser does not read yet, add a case to `src/tests/biopilot/profile/helpParser.test.ts` with the new recording.

Open a pull request with the YAML, the recordings and, for ranks, a short note on who reviewed them.
