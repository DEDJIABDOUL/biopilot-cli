# Usage

Type a command as usual. Suggestions appear under the cursor.

| Key | Action |
|---|---|
| ++tab++ | accept the highlighted suggestion |
| ++arrow-up++ ++arrow-down++ | move in the list |
| ++esc++ | hide the suggestions |

The keys can be changed in [`rc.toml`](../reference/settings.md).

## Examples

In a project folder that contains `data/ctrl_R1.fastq.gz`, `data/ctrl_R2.fastq.gz`, a `results/` folder and a reference `ref/genome.fa` indexed by bwa:

| You type | BioPilot suggests first |
|---|---|
| `fastp ` | `--in1` |
| `fastp --in1 ` | `data/ctrl_R1.fastq.gz`: FASTQ files only, R1 first |
| `fastp --in1 data/ctrl_R1.fastq.gz --in2 ` | `data/ctrl_R2.fastq.gz`, its mate |
| `fastp --in1 data/ctrl_R1.fastq.gz --out1 ` | `results/ctrl_R1.trimmed.fastq.gz` |
| `bwa mem ` | `ref/genome.fa`: the index, once |
| `samtools sort -` | sort's own options |
| `sam` | `samtools` |

Under the suggestions for a bioinformatics tool, a [status line](status-line.md) shows what BioPilot detected, for example `fastp 0.23.4 · conda-meta · env rnaseq`.

General completion (git, cd, ls…) works as before; bioinformatics tools simply come first.

## Find an option by what it does

```shell
biopilot search "adapter"
```

lists the options whose name or description contains every word. See [`biopilot search`](../commands/search.md).

## In this section

- [How suggestions work](how-it-works.md)
- [The status line](status-line.md)
- [Tools outside the Catalog](learn.md)
- [Checking a command](check.md)
- [Stop BioPilot](stop.md)
