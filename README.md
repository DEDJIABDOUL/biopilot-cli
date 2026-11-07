# BioPilot CLI

Terminal autocompletion for bioinformatics. While you type a command, BioPilot suggests the options, files and values that fit tools such as fastp, samtools, bwa or minimap2, as they are actually installed in your active environment, for the project you are working in.

- **Local and private:** no account, no network access, no telemetry, no AI service.
- **Version-aware:** the options come from the version of the tool you really run, and follow `conda activate`.
- **Project-aware:** files of the expected format first, R1/R2 mates paired, output names derived from inputs.
- **Keeps general completion:** git, cd, ls and other commands still complete as usual; bioinformatics tools come first.

Version 1.1. Ten tools are built in: bcftools, blastn, bwa, fastp, fastqc, minimap2, multiqc, porechop, salmon and samtools. Any other installed tool can be added with `biopilot learn`.

## Contents

- [Requirements](#requirements)
- [Install on Ubuntu and other Linux distributions](#install-on-ubuntu-and-other-linux-distributions)
- [Install on macOS](#install-on-macos)
- [Install on Windows (WSL)](#install-on-windows-wsl)
- [Install with npm](#install-with-npm)
- [Start BioPilot](#start-biopilot)
- [Use BioPilot](#use-biopilot)
- [Stop BioPilot](#stop-biopilot)
- [Run a diagnostic](#run-a-diagnostic)
- [Update](#update)
- [Uninstall](#uninstall)
- [Documentation](#documentation)
- [Development](#development)
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

## Install with npm

If you already use Node.js (version 18 or later), you can install BioPilot with npm instead of the script, on Linux, macOS or WSL:

```shell
npm install -g biopilot-cli
```

npm installs the same standalone program as the script, for your system. Then make BioPilot start in every new terminal, for bash:

```shell
biopilot init bash | tail -n 1 >> ~/.bashrc
```

For zsh, use `init zsh` and `~/.zshrc`; for fish, `init fish` and `~/.config/fish/config.fish`. Open a new terminal and continue with [Start BioPilot](#start-biopilot).

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

## Update

Run the installation command again:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

Then open a new terminal. Your settings and data are kept. If a terminal reports `biopilot resources out of date`, run `biopilot reinit`.

If you installed with npm, run `npm update -g biopilot-cli` instead.

To install a specific version, set `BIOPILOT_VERSION` for the script, for example:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | BIOPILOT_VERSION=1.1.0 sh
```

## Uninstall

```shell
biopilot uninstall
```

BioPilot lists everything it will remove and asks for confirmation: the program, its settings, its data, and the start line in your shell's startup file. The rest of your files are not touched. To skip the confirmation, run `biopilot uninstall --yes`.

If you installed with npm, `biopilot uninstall` removes the settings, data and start line; then remove the program itself with `npm uninstall -g biopilot-cli`.

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

`npm test` runs the unit tests and `npm run test:e2e` the end-to-end tests in real bash, zsh and fish sessions. `npm run perf:targets` checks the performance targets. The domain vocabulary is in [GLOSSARY.md](./GLOSSARY.md) and the architecture decisions in [docs/adr/](./docs/adr/).

## Credits and license

BioPilot CLI is a light fork of [Microsoft Inshellisense](https://github.com/microsoft/inshellisense). The engine (terminal handling, command parsing, rendering) comes from Inshellisense; BioPilot's changes to it are listed in the specification and marked `BIOPILOT:` in the code. BioPilot is not affiliated with or endorsed by Microsoft.

BioPilot CLI is released under the MIT license. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
