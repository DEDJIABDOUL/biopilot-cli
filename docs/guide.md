# BioPilot CLI — user guide

BioPilot completes bioinformatics command lines as you type, in your own terminal (bash, zsh, fish), on Linux and macOS (Windows through WSL). It knows the options of tools such as fastp, samtools, bwa or minimap2 *as they are installed in your active environment*, and the files of the project you are in. It works offline, sends nothing anywhere, and needs no LLM.

- [Install, update, uninstall](#install-update-uninstall)
- [Using it](#using-it)
- [What the suggestions are based on](#what-the-suggestions-are-based-on)
- [The status line](#the-status-line)
- [Commands](#commands)
- [Project configuration: `.biopilot.toml`](#project-configuration-biopilottoml)
- [Configuration: `rc.toml`](#configuration-rctoml)
- [Privacy: what BioPilot reads, runs and stores](#privacy-what-biopilot-reads-runs-and-stores)
- [Troubleshooting](#troubleshooting)

## Install, update, uninstall

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

The script downloads the standalone binary for your system from the latest [GitHub Release](https://github.com/DEDJIABDOUL/biopilot-cli/releases) (Node embedded: nothing to compile, no prerequisite), checks that the release's checksums are signed by the BioPilot release key (with `openssl`) and that the binary matches them, installs it as `~/.local/bin/biopilot` and its resources — the Catalog included — in `~/.local/share/biopilot/`. It never uses `sudo` and never edits your files: at the end it prints **one line to add** to `~/.bashrc`, `~/.zshrc` or `~/.config/fish/config.fish`. Add it, open a new terminal: BioPilot is on.

| Variable (before `sh`) | Effect |
|---|---|
| `BIOPILOT_VERSION=0.1.0` | install that version instead of the latest |
| `BIOPILOT_INSTALL_DIR=~/bin` | install the binary there instead of `~/.local/bin` |
| `BIOPILOT_DOWNLOAD_URL=…` | download from a mirror (a folder holding the release files) |

If the script warns that `~/.local/bin` is not on your `PATH`, add `export PATH="$HOME/.local/bin:$PATH"` to your shell's startup file first.

**Update:** run the same line again. A session that finds its resources of another version tells you to run `biopilot reinit`.

**Uninstall:** `biopilot uninstall` lists what it will remove — the binary, the configuration, the data folder (Profiles and usage included) and the init line of your shell files (your other lines are kept) — and asks before removing it. `biopilot uninstall --yes` skips the question.

**From the sources:** see the README's Development section; `biopilot init bash` (or `zsh`, `fish`) then prints the line to add.

## Using it

Once the init line is in your shell's startup file, every new terminal runs inside a BioPilot session (`biopilot -c` tells you whether the current one does). Type as usual; suggestions appear under the cursor.

| Key | Action |
|---|---|
| <kbd>Tab</kbd> | accept the highlighted suggestion |
| <kbd>↑</kbd> <kbd>↓</kbd> | move in the list |
| <kbd>Esc</kbd> | hide the suggestions |

Examples, in a project with `data/ctrl_R1.fastq.gz`, `data/ctrl_R2.fastq.gz`, a `results/` folder and `ref/genome.fa` indexed by bwa:

| You type | BioPilot puts first |
|---|---|
| `fastp ` | `--in1` |
| `fastp --in1 ` | `data/ctrl_R1.fastq.gz` — FASTQ files only, R1 first |
| `fastp --in1 data/ctrl_R1.fastq.gz --in2 ` | `data/ctrl_R2.fastq.gz`, its mate |
| `fastp --in1 data/ctrl_R1.fastq.gz --out1 ` | `results/ctrl_R1.trimmed.fastq.gz` |
| `bwa mem ` | `ref/genome.fa` — the index, once |
| `samtools sort -` | sort's own options |
| `sam` | `samtools` |

General completion (git, cd, ls…) works as before; bio tools simply come first.

## What the suggestions are based on

1. **The Catalog** — a database shipped with BioPilot describing 44 tools (bcftools, bedtools, bgzip, blastn, bowtie2, bowtie2-build, busco, bwa, bwa-mem2, chopper, cutadapt, fastp, fastqc, filtlong, flye, freebayes, gatk, hisat2, hisat2-build, medaka, medaka_consensus, medaka_variant, megahit, minimap2, mosdepth, multiqc, NanoPlot, picard, porechop, qualimap, quast, salmon, samtools, seqkit, seqtk, SnpEff, SnpSift, spades.py, STAR, tabix, trimmomatic, vcfanno, VCFtools, VEP): their options, subcommands, value types, file formats, read pairs, derived outputs, and a rank for each option. `biopilot info fastp` shows what it knows.
2. **The binary you would run** — BioPilot looks up the tool in your shell's `PATH` (it follows `conda activate`), finds its version in `conda-meta/` or by asking the tool, and reads the tool's own `--help` once per version: its **Profile**. With a Profile, only the options your version really has are suggested (fastp 0.20.1 gets no `--dedup`). The first time, the Catalog's options (filtered by version when it is known) show while the Profile is computed in the background; `biopilot sync` computes them ahead of time.
3. **The project** — from the first parent folder holding `.git`, `Snakefile`, `nextflow.config`, `environment.yml` or `.biopilot.toml`, BioPilot reads file names (never contents): files of the expected format, read pairs, the platform (illumina, nanopore) and the assay, which adjust the ranking.
4. **Your habits** — options you accept often rise a little (+15 at most). `biopilot reset-usage` forgets them.

**Tools outside the Catalog:** `biopilot learn <tool>` reads the tool's root help (`--help`, `-h`, or no argument), discovers its subcommands (one level, 50 at most) and how to print its version (`--version`, `-V` or `version`), and computes its Profiles. From then on it is completed like a Catalog tool, from its own help only: its options rank by your usage, and values are completed as files. BioPilot never runs a tool you merely type: only `learn` runs an unknown one.

## The status line

Under the suggestions of a Catalog tool, a dim line tells what BioPilot detected:

```text
 fastp 0.23.4 · conda-meta · env rnaseq
 fastp (version unknown) · reading its real options…
 fastp · not installed: options from the Catalog
```

Turn it off with `statusLine = false` in [`rc.toml`](#configuration-rctoml).

## Commands

| Command | What it does |
|---|---|
| `biopilot` | start a session in the current terminal (the init line does it for you) |
| `biopilot init <shell>` | prepare the shell plugin and print the line to add (`bash`, `zsh`, `fish`) |
| `biopilot reinit` | reinstall the resources (Catalog, shell plugins) after an update; your data is kept |
| `biopilot doctor` | check the installation: shell plugins, Catalog, User store, `PATH`, environment |
| `biopilot status [--json]` | show the environment, the project and, per Catalog tool, the binary, version and Profile |
| `biopilot sync` | compute the Profiles of the Catalog tools of the active environment |
| `biopilot info [--json] [tool] [command…] [option]` | what the Catalog knows about a tool, a subcommand or an option (`biopilot info samtools sort -o`) |
| `biopilot learn <tool>` | import an installed tool that is not in the Catalog, from its own help; `--list`, `--forget <tool>` |
| `biopilot search [--json] [--tool <tool>] "<text>"` | find options of the Catalog and of learned tools by their names and descriptions |
| `biopilot reset-usage` | erase the usage statistics |
| `biopilot uninstall [--yes]` | remove BioPilot entirely |
| `biopilot -c` | tell whether this terminal runs in a BioPilot session |
| `biopilot -V` | start a session with verbose logging |

BioPilot's own flags go before the tool name: in `biopilot info fastp --json`, `--json` is fastp's option, not BioPilot's.

## Project configuration: `.biopilot.toml`

Detection is automatic; a `.biopilot.toml` at the project root corrects it when needed and always has the last word. Every key is optional; an invalid file is ignored.

```toml
assay = "rna-seq"            # rna-seq | variant-calling | unknown
platform = ["illumina"]      # illumina, nanopore, or both
results_dir = "out"          # where derived output names go (default: results/ when it exists)
reference = "ref/GRCh38.fa"  # offered first wherever a reference fits
```

## Configuration: `rc.toml`

`~/.config/biopilot/rc.toml` (or `$XDG_CONFIG_HOME/biopilot/rc.toml`):

```toml
statusLine = true                          # the status line under bio tools' suggestions
maxSuggestions = 5                         # suggestions shown at once
activeSuggestionBackgroundColor = "#7D56F4"
boxBorderStyle = "square"                  # or "rounded"
useAliases = false                         # complete your shell aliases' targets
useNerdFont = false

[bindings.acceptSuggestion]
key = "tab"
[bindings.nextSuggestion]
key = "down"
[bindings.previousSuggestion]
key = "up"
[bindings.dismissSuggestions]
key = "escape"
```

## Privacy: what BioPilot reads, runs and stores

- **No network, no telemetry, ever.** Everything happens on your machine.
- **Reads:** file and folder *names* of the current project (depth 3, 2 000 entries at most, hidden folders, `node_modules`, `work/` and `.snakemake/` skipped); the content of `environment.yml` (64 KB at most) and `.biopilot.toml` only. Never the content of your data files.
- **Runs:** only the tools of the Catalog and the tools you imported with `biopilot learn` found in your `PATH`, and only with their declared version and help commands (`fastp --version`, `fastp --help`): standard input closed, 2.5 s at most, stopped together with anything they started. Relative `PATH` entries are ignored, so the current folder never decides what runs. The prompt itself runs no command.
- **Stores** in `~/.local/share/biopilot/user.db` (readable by you only): the Profiles (the options of each tool version), the versions found, and how often you accepted each option. `biopilot reset-usage` erases the usage; `biopilot uninstall` erases everything.

## Troubleshooting

| Symptom | Try |
|---|---|
| No suggestions at all | `biopilot -c`: if not in a session, check the init line in your startup file, open a new terminal |
| "resources out of date" | `biopilot reinit` |
| Options that your version does not have | `biopilot status`: is it the binary you expect? Then `biopilot sync` |
| A tool's options never become its real ones | `biopilot sync` reports `failed` when its `--help` cannot be read: the Catalog's options stay |
| Wrong files offered | `biopilot status` shows the detected project; fix it with `.biopilot.toml` |
| Anything else | `biopilot doctor`; logs of a session started with `biopilot -V` are in `~/.local/share/biopilot/log/biopilot.log` |

Bugs and questions: <https://github.com/DEDJIABDOUL/biopilot-cli/issues>.
