# Checking a command

`biopilot check` reads a command line with the Catalog and warns about mistakes that would otherwise show up hours later. It never runs the command and never reads the content of a file: only file names, whether files exist, and the CPUs available.

```console
$ biopilot check "fastp -i data/s1_R1.fastq.gz -I data/s2_R2.fastq.gz -o out/s1.fq.gz -w 64"
⚠ -I data/s2_R2.fastq.gz is not the mate of -i data/s1_R1.fastq.gz: samples s1 and s2  [read-pair]
⚠ -o out/s1.fq.gz: the folder out does not exist  [output-folder-missing]
⚠ -w 64 asks for 64 threads; only 8 CPUs are available on this machine  [threads-above-cpus]
```

The same warnings appear live in the [status line](status-line.md) while you type.

## Rules

| Rule | Warns when |
|---|---|
| `read-pair` | the two mates of a read pair belong to different samples or folders, are swapped (read 2 given as read 1), or are both read 1 (or both read 2) files |
| `output-is-input` | an output would overwrite one of the command's inputs |
| `output-folder-missing` | an output file, or an output folder, is in a folder that does not exist |
| `input-missing` | an input file or folder does not exist |
| `reference-index` | a Reference index named by a prefix lacks some of its files, or has none; an index folder lacks its marker file (`salmon quant -i`) |
| `threads-above-cpus` | a thread count is above the CPUs available: a SLURM job's `SLURM_CPUS_PER_TASK`, else the cgroup's CPU quota, else the machine's CPUs |
| `option-version` | an option is absent from the installed version's Profile (`--dedup is not an option of fastp (fastp 0.20.1)`); without a Profile, outside the Catalog's version range of the option. Nothing is said while the Profile is unknown: run `biopilot sync` |
| `option-deprecated` | an option the Catalog marks deprecated; an *info*, which does not change the exit code |

## What is checked

- Pipelines and lists are checked command by command (`bwa mem … | samtools sort …`); redirections are ignored.
- Standard streams (`-`, `/dev/stdin`), URIs (`gendb://`), patterns (`*.bam`) and variables (`$BAM`) are never reported as missing.
- After an option the Catalog doesn't know, the command's positional arguments are not checked: BioPilot cannot tell whether the next word is that option's value.
- Inputs and outputs are checked where the Catalog declares them: the main files of every Catalog tool. Learned tools are not checked.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | no warning (infos do not count) |
| `1` | at least one warning |
| `2` | the line cannot be analysed: no Catalog tool on it, an unterminated quote, or the Catalog unavailable |

## JSON output

`--json` prints the result in a versioned format (`"format": 1`), published as a JSON Schema in [`schemas/check-output.schema.json`](https://github.com/DEDJIABDOUL/biopilot-cli/blob/main/schemas/check-output.schema.json), for scripts and workflow managers:

```shell
biopilot check --json "$cmd" > /dev/null || echo "check this command first: $cmd"
```
