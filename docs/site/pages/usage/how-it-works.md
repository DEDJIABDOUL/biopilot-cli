# How suggestions work

Four sources decide what is suggested and in which order.

<div class="grid cards" markdown>

-   <span class="bp-k">1 · Catalog</span>
    **The built-in database**

    44 tools described: options, subcommands, value types, file formats, read pairs, derived outputs, and a rank for each option. `biopilot info fastp` shows it.

-   <span class="bp-k">2 · Profile</span>
    **The program you would run**

    Found in your shell's `PATH` (it follows `conda activate`). Its own `--help` is read once per version.

-   <span class="bp-k">3 · Project</span>
    **Your files, by name**

    Files of the expected format, read pairs, the platform and the assay of the project you are in.

-   <span class="bp-k">4 · Habits</span>
    **What you accept**

    Options you accept often rise a little in the list.

</div>

## 1. The Catalog

A database shipped with BioPilot describes [44 tools](../reference/tools.md): their options, subcommands, value types, file formats, read pairs, derived outputs, and a rank for each option. `biopilot info fastp` shows what it knows.

## 2. The program you would run: its Profile

BioPilot looks up the tool in your shell's `PATH`, which follows `conda activate`. It finds its version in `conda-meta/` or by asking the tool, and reads the tool's own `--help` once per version: its **Profile**.

With a Profile, only the options your version really has are suggested: fastp 0.20.1 gets no `--dedup`. The first time, the Catalog's options (filtered by version when it is known) show while the Profile is computed in the background. `biopilot sync` computes them ahead of time.

## 3. The project

From the first parent folder holding `.git`, `Snakefile`, `nextflow.config`, `environment.yml` or `.biopilot.toml`, BioPilot reads file names, never their contents:

- files of the expected format come first;
- read pairs are matched (R1 first, then its mate);
- the platform (illumina, nanopore) and the assay adjust the ranking;
- output names are derived from inputs, in `results/` when it exists.

A [`.biopilot.toml`](../reference/project-config.md) file corrects the detection when needed.

## 4. Your habits

Options you accept often rise a little (+15 at most). `biopilot reset-usage` forgets them.
