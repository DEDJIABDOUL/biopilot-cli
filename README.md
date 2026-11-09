# BioPilot CLI

Terminal autocompletion for bioinformatics. While you type a command, BioPilot suggests the options, files and values that fit tools such as fastp, samtools, bwa or minimap2, as they are actually installed in your active environment, for the project you are working in.

![BioPilot in a terminal: typing fastp offers --in1 first, then the read 1 file, then --in2 and its mate, then a derived output name in results/; bwa mem is offered the reference index; biopilot search finds fastp's adapter options. Under the suggestions, the status line names fastp 0.23.4 from the conda environment rnaseq.](docs/demo/demo.gif)

- **Local and private:** no account, no network access, no telemetry, no AI service.
- **Version-aware:** the options come from the version of the tool you really run, and follow `conda activate`.
- **Project-aware:** files of the expected format first, R1/R2 mates paired, output names derived from inputs.
- **Keeps general completion:** git, cd, ls and other commands still complete as usual; bioinformatics tools come first.

Version 1.1. 44 tools are built in: bcftools, bedtools, bgzip, blastn, bowtie2, bowtie2-build, busco, bwa, bwa-mem2, chopper, cutadapt, fastp, fastqc, filtlong, flye, freebayes, gatk, hisat2, hisat2-build, medaka, medaka_consensus, medaka_variant, megahit, minimap2, mosdepth, multiqc, NanoPlot, picard, porechop, qualimap, quast, salmon, samtools, seqkit, seqtk, SnpEff (snpEff), SnpSift, spades.py, STAR, tabix, trimmomatic, vcfanno, VCFtools (vcftools) and VEP (vep). Any other installed tool can be added with `biopilot learn`.

## Contents

- [Requirements](#requirements)
- [Install on Ubuntu and other Linux distributions](#install-on-ubuntu-and-other-linux-distributions)
- [Install on macOS](#install-on-macos)
- [Install on Windows (WSL)](#install-on-windows-wsl)
- [Start BioPilot](#start-biopilot)
- [Use BioPilot](#use-biopilot)
- [Stop BioPilot](#stop-biopilot)
- [Run a diagnostic](#run-a-diagnostic)
- [Command reference](#command-reference)
- [Update](#update)
- [Uninstall](#uninstall)
- [Documentation](#documentation)
- [Development](#development)
- [Contributing and citing](#contributing-and-citing)
- [Credits and license](#credits-and-license)

## Requirements

| | Supported |
|---|---|
| Linux | x86_64 or arm64, glibc 2.28 or later (Ubuntu 20.04 or later, Debian 10 or later, Rocky or RHEL 8 or later) |
| macOS | 11 (Big Sur) or later, Apple silicon or Intel |
| Windows | Windows 10 or 11 through WSL 2, with a Linux distribution such as Ubuntu |
| Shell | bash, zsh or fish |
| Tools | `curl` or `wget`, `gzip`, `openssl`, and `sha256sum` or `shasum`; they come with these systems |
| Disk space | about 250 MB |

You do not need administrator rights, Node.js, a compiler or a network connection after installation. BioPilot is a standalone program installed in your home folder.

BioPilot helps with the bioinformatics tools you already have (in a conda environment, for example). It does not install them.

## Install on Ubuntu and other Linux distributions

1. Download and install BioPilot:

   ```shell
   curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
   ```

   If `curl` is not installed, use `wget` instead:

   ```shell
   wget -qO- https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
   ```

   The script downloads the program for your system, checks that the release is signed by the BioPilot release key and that the program matches its SHA-256 checksum, and installs it as `~/.local/bin/biopilot`, with its data in `~/.local/share/biopilot/`. It refuses to install anything that fails these checks, and it does not change any of your files.

2. Make BioPilot start in every new terminal. With bash, the default shell on Ubuntu:

   ```shell
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   ~/.local/bin/biopilot init bash | tail -n 1 >> ~/.bashrc
   ```

   The first line makes the `biopilot` command available; skip it if `~/.local/bin` is already on your `PATH`. The second line adds the BioPilot start line at the end of `~/.bashrc`; it must stay the last line of the file.

   With zsh, use `~/.zshrc` and `init zsh` instead. With fish:

   ```shell
   fish_add_path ~/.local/bin
   ~/.local/bin/biopilot init fish | tail -n 1 >> ~/.config/fish/config.fish
   ```

3. Close the terminal and open a new one. Continue with [Start BioPilot](#start-biopilot).

## Install on macOS

1. Open the Terminal application and run:

   ```shell
   curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
   ```

2. Make BioPilot start in every new terminal. With zsh, the default shell on macOS:

   ```shell
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
   ~/.local/bin/biopilot init zsh | tail -n 1 >> ~/.zshrc
   ```

   If you use bash, write to `~/.bashrc` with `init bash`; for fish, see the Linux instructions above.

3. Close the terminal window and open a new one. Continue with [Start BioPilot](#start-biopilot).

## Install on Windows (WSL)

BioPilot runs in the Windows Subsystem for Linux (WSL), which provides a real Linux environment on Windows. It does not run in PowerShell or the Command Prompt.

1. If WSL is not installed yet, open PowerShell as administrator and run:

   ```powershell
   wsl --install
   ```

   This installs WSL 2 with Ubuntu. Restart Windows when asked, then open "Ubuntu" from the Start menu and choose a user name and password.

2. In the Ubuntu terminal, follow the [Ubuntu instructions](#install-on-ubuntu-and-other-linux-distributions) above. Install BioPilot inside WSL, in the same Linux environment as your bioinformatics tools.

3. Close the Ubuntu terminal and open it again. Continue with [Start BioPilot](#start-biopilot).

Windows Terminal, available from the Microsoft Store, gives the best display of the suggestions.

## Start BioPilot

Once installed, BioPilot starts by itself in every new terminal. To check that it is running, type:

```shell
biopilot -c
```

The answer is `biopilot session [live]` when BioPilot is running in this terminal, and `biopilot session [not found]` when it is not.

To start BioPilot in a terminal where it is not running, type:

```shell
biopilot
```

## Use BioPilot

Type a command as usual. Suggestions appear under the cursor:

| Key | Action |
|---|---|
| Tab | accept the highlighted suggestion |
| Up and Down arrows | move in the list |
| Escape | hide the suggestions |

Examples, in a project folder that contains `data/ctrl_R1.fastq.gz`, `data/ctrl_R2.fastq.gz`, a `results/` folder and a reference `ref/genome.fa` indexed by bwa:

| You type | BioPilot suggests first |
|---|---|
| `fastp ` | `--in1` |
| `fastp --in1 ` | `data/ctrl_R1.fastq.gz` |
| `fastp --in1 data/ctrl_R1.fastq.gz --in2 ` | `data/ctrl_R2.fastq.gz` |
| `fastp --in1 data/ctrl_R1.fastq.gz --out1 ` | `results/ctrl_R1.trimmed.fastq.gz` |
| `bwa mem ` | `ref/genome.fa` |
| `sam` | `samtools` |

Under the suggestions for a bioinformatics tool, a status line shows what BioPilot detected, for example `fastp 0.23.4 · conda-meta · env rnaseq`.

To read the real options of the tools in your active conda environment ahead of time, run `biopilot sync` once in that environment. Otherwise BioPilot reads them in the background the first time you use each tool.

### Tools outside the built-in list

To get suggestions for another installed tool, import it once:

```shell
biopilot learn STAR
```

BioPilot reads the tool's own help, finds its subcommands and how to get its version, and completes it from then on like a built-in tool. BioPilot only runs an unknown tool when you ask it to with this command; typing a command never runs it. `biopilot learn --list` shows the imported tools and `biopilot learn --forget STAR` removes one.

### Find an option by what it does

```shell
biopilot search "adapter"
```

lists the options of the built-in and imported tools whose name or description contains every word. Add `--tool fastp` to search one tool, or `--json` for a machine-readable answer.

### Check a command before running it

```shell
biopilot check "fastp -i data/ctrl_R1.fastq.gz -I data/treat_R2.fastq.gz -o out/ctrl.fq.gz -w 64"
```

warns about mistakes that would otherwise show up hours later, without running the command or reading your files. It prints one line per warning (each starts with a warning sign in the terminal):

```text
-I data/treat_R2.fastq.gz is not the mate of -i data/ctrl_R1.fastq.gz: samples ctrl and treat  [read-pair]
-o out/ctrl.fq.gz: the folder out does not exist  [output-folder-missing]
-w 64 asks for 64 threads; only 8 CPUs are available on this machine  [threads-above-cpus]
```

It also reports a missing input, an output that would overwrite an input, an incomplete reference index, and an option the installed version of the tool doesn't have. While you type in a BioPilot session, the first warning appears at the start of the status line; it never blocks Enter. See [`biopilot check`](#biopilot-check) below.

## Stop BioPilot

- **Hide the suggestions for a moment:** press Escape.
- **Leave BioPilot in the current terminal:** type `exit`. BioPilot replaces your shell in the terminal it starts in, so this also closes the terminal window or tab.
- **Stop starting BioPilot in new terminals:** open your shell's startup file (`~/.bashrc`, `~/.zshrc` or `~/.config/fish/config.fish`), delete the last line, the one that contains `biopilot/init`, or put a `#` in front of it. Then open a new terminal. To use BioPilot again, remove the `#`.
- **Remove BioPilot completely:** see [Uninstall](#uninstall).

## Run a diagnostic

Run these commands in a terminal:

| Command | What it tells you |
|---|---|
| `biopilot -c` | whether BioPilot is running in this terminal |
| `biopilot doctor` | whether the installation is complete: shell start lines, the tool database (Catalog), the user data, the `PATH` and the active environment |
| `biopilot status` | the active conda environment, the detected project and, for each supported tool, the program found, its version and whether its real options are known |
| `biopilot info fastp` | what BioPilot knows about a tool; also works for a subcommand or an option, for example `biopilot info samtools sort -o` |
| `biopilot learn --list` | the tools you imported with `biopilot learn` |

`biopilot doctor` names each problem it finds and what to do about it. Common fixes:

| Problem | Fix |
|---|---|
| `biopilot: command not found` | add `~/.local/bin` to your `PATH` (see step 2 of the installation) |
| `biopilot resources out of date` | run `biopilot reinit` |
| no suggestions in a new terminal | check that the start line is the last line of your startup file, then open a new terminal |
| suggestions for another version of a tool | run `biopilot status` to see which program BioPilot found, then `biopilot sync` |

For a detailed log, start BioPilot with `biopilot -V`; the log is written to `~/.local/share/biopilot/log/biopilot.log`.

## Command reference

BioPilot's own options go before the tool name: in `biopilot info fastp --json`, `--json` is an option of fastp, not of BioPilot. Every command answers `--help`.

| Command | What it does |
|---|---|
| [`biopilot`](#biopilot) | start a BioPilot session in the current terminal |
| [`biopilot init`](#biopilot-init) | print the start line to add to your shell's startup file |
| [`biopilot reinit`](#biopilot-reinit) | reinstall BioPilot's resources after an update |
| [`biopilot doctor`](#biopilot-doctor) | check the installation |
| [`biopilot status`](#biopilot-status) | show the environment, the project and the tools BioPilot detects |
| [`biopilot sync`](#biopilot-sync) | read the real options of the tools of the active environment ahead of time |
| [`biopilot info`](#biopilot-info) | show what BioPilot knows about a tool, a subcommand or an option |
| [`biopilot search`](#biopilot-search) | find an option by what it does |
| [`biopilot check`](#biopilot-check) | warn about a command line before it runs |
| [`biopilot learn`](#biopilot-learn) | import a tool that is not built in |
| [`biopilot reset-usage`](#biopilot-reset-usage) | forget which options you use most |
| [`biopilot complete`](#biopilot-complete) | print the suggestions for a line, as JSON |
| [`biopilot specs list`](#biopilot-specs-list) | list the completion specs available for general commands |
| [`biopilot uninstall`](#biopilot-uninstall) | remove BioPilot |

### `biopilot`

```shell
biopilot [-s <shell>] [-l] [-V]
biopilot -c
biopilot -v
```

Starts a BioPilot session: your shell runs inside it, with suggestions under the cursor. The start line added at installation does this in every new terminal; type `exit` to leave the session (and the terminal).

| Option | Effect |
|---|---|
| `-s, --shell <shell>` | the shell to run: `bash`, `zsh` or `fish` (default: the shell you type it in) |
| `-l, --login` | start the shell as a login shell |
| `-V, --verbose` | write a detailed log to `~/.local/share/biopilot/log/biopilot.log` |
| `-c, --check` | tell whether this terminal runs in a BioPilot session: `biopilot session [live]` or `[not found]` |
| `-v, --version` | print BioPilot's version |

### `biopilot init`

```shell
biopilot init bash      # or zsh, fish
```

Prepares the shell plugin and prints the line that starts BioPilot, to put at the end of your shell's startup file (see the installation steps). The line does nothing when `biopilot` is not on the `PATH`.

### `biopilot reinit`

```shell
biopilot reinit
```

Replaces BioPilot's resources (the Catalog of built-in tools, the shell plugins, the completion specs) with those of the installed version. Run it when a terminal reports `biopilot resources out of date`. Your settings, imported tools and data are kept.

### `biopilot doctor`

```shell
biopilot doctor
```

Checks the installation: the start lines of your shells, the Catalog, the user data, the `PATH` and the active environment. It names each problem and what to do about it.

### `biopilot status`

```shell
biopilot status [--json]
```

Shows the active conda environment, the detected project (its root, platforms, assay, read pairs) and, for each built-in tool, the program found on the `PATH`, its version, where that version comes from, and whether its real options are known. `--json` prints the same as JSON.

### `biopilot sync`

```shell
biopilot sync
```

Reads, once, the real options of every built-in tool installed in the active environment, from each tool's own help, for the version installed, and lists what it found. Without it, BioPilot does the same in the background the first time you use a tool. Run it again after installing or updating tools. (Imported tools are read when you run `biopilot learn`.)

### `biopilot info`

```shell
biopilot info                      # the built-in tools
biopilot info fastp                # a tool and its options
biopilot info fastp -i             # one option (any of its names)
biopilot info samtools sort        # a subcommand
biopilot info samtools sort -o     # an option of a subcommand
biopilot info --json fastp -i      # the same, as JSON
```

Shows what BioPilot knows about a tool, a subcommand or an option: descriptions, values, file formats, read pairs, default values and the versions that have it. The JSON format is published in [`schemas/info-output.schema.json`](./schemas/info-output.schema.json).

### `biopilot search`

```shell
biopilot search [--json] [--tool <tool>] "<text>"
```

Finds the options of the built-in and imported tools whose name or description contains every word of the text, the last word as a prefix. `--tool fastp` limits the search to one tool; `--json` prints the results as JSON.

### `biopilot check`

```shell
biopilot check [--json] "<command line>"
biopilot check -- samtools sort -o out.bam in.bam
```

Reads a command line with what BioPilot knows of its tools and warns about mistakes before it runs. It never runs the command and never reads the content of a file: only file names, whether files exist, the CPUs available and the installed version's options.

| Warning | When |
|---|---|
| `read-pair` | the read 1 and read 2 files belong to different samples or folders, are swapped, or are both read 1 (or both read 2) |
| `output-is-input` | an output would overwrite one of the inputs |
| `output-folder-missing` | an output is in a folder that does not exist |
| `input-missing` | an input file or folder does not exist |
| `reference-index` | a reference index lacks some of its files, or has none; an index folder lacks its marker file |
| `threads-above-cpus` | a thread count is above the CPUs available: a SLURM job's `SLURM_CPUS_PER_TASK`, else the container's CPU quota, else the machine's CPUs |
| `option-version` | an option the installed version of the tool doesn't have |
| `option-deprecated` | an obsolete option (information only) |

Pipelines (`bwa mem … | samtools sort …`) are checked command by command. Standard input and output (`-`), URIs, patterns (`*.bam`) and variables (`$BAM`) are never reported as missing. Exit code **0** without a warning, **1** with at least one, **2** when the line cannot be checked (no built-in tool on it, an unterminated quote). `--json` prints the result in the format of [`schemas/check-output.schema.json`](./schemas/check-output.schema.json), for scripts and workflows:

```shell
biopilot check --json "$cmd" > /dev/null || echo "check this command first: $cmd"
```

In a BioPilot session, the first warning of the line being typed starts the status line. Turn this off with `warnings = false` in `~/.config/biopilot/rc.toml`, or in a project's `.biopilot.toml` for that project only.

### `biopilot learn`

```shell
biopilot learn <tool>              # import an installed tool
biopilot learn --list              # the imported tools
biopilot learn --forget <tool>     # remove one
```

Imports an installed tool that is not built in: BioPilot reads its own help, finds its subcommands (one level) and how to get its version, then completes it like a built-in tool, with the options of the version installed. It refuses a built-in tool, a tool that is not installed, and a tool whose help it cannot read. This is the only command that runs a tool BioPilot doesn't know; typing a command never runs it.

### `biopilot reset-usage`

```shell
biopilot reset-usage
```

Erases the usage statistics: how often you accepted each option, which makes your usual options rise in the suggestions. Nothing else is touched.

### `biopilot complete`

```shell
biopilot complete "fastp --in1 "
```

Prints, as JSON, the suggestions BioPilot would show for a line, in the current folder. For scripts and editors; a session does not need it.

### `biopilot specs list`

```shell
biopilot specs list [-s bash|zsh]
```

Prints, as a JSON list, the names of the commands BioPilot has completion specs for, besides the bioinformatics tools (git, cd, ls…); with `-s`, the names of your shell's aliases too.

### `biopilot uninstall`

```shell
biopilot uninstall [-y]
```

Lists everything it will remove, asks for confirmation, then removes BioPilot: the program, its settings, its data and the start line in your shells' startup files. `-y, --yes` removes without asking. See [Uninstall](#uninstall).

## Update

Run the installation command again:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

Then open a new terminal. Your settings and data are kept. If a terminal reports `biopilot resources out of date`, run `biopilot reinit`.

To install a specific version, set `BIOPILOT_VERSION` for the script, for example:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | BIOPILOT_VERSION=1.1.4 sh
```

## Uninstall

```shell
biopilot uninstall
```

BioPilot lists everything it will remove and asks for confirmation: the program, its settings, its data, and the start line in your shell's startup file. The rest of your files are not touched. To skip the confirmation, run `biopilot uninstall --yes`.

## Documentation

- [User guide](./docs/guide.md): what the suggestions are based on, every command, the project file `.biopilot.toml`, settings, privacy, troubleshooting.
- [Adding a tool to the Catalog](./docs/contributing-tools.md): how to describe a new tool so that BioPilot can suggest its options.
- [Changelog](./CHANGELOG.md).
- [Releasing](./docs/releasing.md): how a version is published and signed.
- [Specification](./biopilot-cli-cahier-des-charges.md), in French.

## Development

To work on BioPilot from the source code, with conda:

```shell
git clone https://github.com/DEDJIABDOUL/biopilot-cli.git
cd biopilot-cli
conda create -n biopilot-dev -c conda-forge nodejs=22 zsh fish
conda activate biopilot-dev
npm ci
npm run build:db
npm run build
npm test
node build/index.js
```

`npm test` runs the unit tests and `npm run test:e2e` the end-to-end tests in real bash, zsh and fish sessions. `npm run demo` records the animation above again (it needs [agg](https://github.com/asciinema/agg): `conda install -c conda-forge asciinema-agg`). `npm run perf:targets` checks the performance targets. The domain vocabulary is in [GLOSSARY.md](./GLOSSARY.md) and the architecture decisions in [docs/adr/](./docs/adr/).

## Contributing and citing

Tool requests, Catalog additions and fixes are welcome: see [CONTRIBUTING.md](./CONTRIBUTING.md). To cite BioPilot, use [CITATION.cff](./CITATION.cff) (GitHub's "Cite this repository" button).

## Credits and license

BioPilot CLI is released under the MIT license. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
