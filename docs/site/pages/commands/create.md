# biopilot create

Print the command that creates a standard bioinformatics project, then enters it.

```text
biopilot create <project>
```

It creates nothing itself: read the command, change it if you wish, then run it.

## Examples

```console
$ biopilot create rnaseq-2026
mkdir -p rnaseq-2026/data/raw rnaseq-2026/data/processed rnaseq-2026/metadata rnaseq-2026/reference rnaseq-2026/results rnaseq-2026/scripts rnaseq-2026/logs rnaseq-2026/envs rnaseq-2026/notebooks rnaseq-2026/docs && cd rnaseq-2026
```

To create the project and enter it in one go:

=== "bash, zsh"

    ```shell
    eval "$(biopilot create rnaseq-2026)"
    ```

=== "fish"

    ```shell
    biopilot create rnaseq-2026 | source
    ```

The project can also be a path:

```shell
eval "$(biopilot create ~/projects/wgs_trio)"
```

## The layout

```text
rnaseq-2026/
├── data/
│   ├── raw/          the reads as received, never modified
│   └── processed/    intermediate files: trimmed reads, alignments
├── metadata/         sample sheets, experimental design
├── reference/        genome, annotation, indexes
├── results/          final outputs
├── scripts/          analysis code
├── logs/             the tools' logs
├── envs/             conda environment files
├── notebooks/        exploration, figures
└── docs/             notes, protocols, reports
```

## Recognised at once

Right after the command, BioPilot recognises the project from any of its folders, by its layout alone: no hidden file is written.

- `biopilot status` names the project, with the marker `project layout`;
- the reads you put in `data/raw` are paired, R1 with R2;
- output names are derived in `results/`, for example `results/s1_R1.trimmed.fastq.gz`.

The layout counts as long as `data/raw`, `metadata`, `reference` and `results` are there; the other folders can be removed. A project marker nearer to where you are, such as a `Snakefile` in `scripts/pipeline/`, takes precedence.

!!! tip "Put the reads directly in `data/raw`"
    BioPilot reads file names three levels deep from the project root. `data/raw/s1_R1.fastq.gz` is seen; `data/raw/run1/fastq/s1_R1.fastq.gz` is not.

## Project names

Letters, digits, `.`, `_`, `+` and `-`, not starting with `-` or `.`, in a folder name or a path (`~/…`, `/…`, `../…`). That way the command works unquoted in bash, zsh and fish, and is safe to run with `eval`. A name with a space, `;`, `$`, `*` or a backslash is refused.

## Exit code

**0** with the command printed; **2** when the project name is missing, repeated or not usable.

## See also

[`status`](status.md) · [How suggestions work](../usage/how-it-works.md) · [Project file (.biopilot.toml)](../reference/project-config.md)
