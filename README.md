# BioPilot CLI

Terminal autocompletion for bioinformatics. While you type, BioPilot suggests the options, files and values that fit tools such as fastp, samtools, bwa or minimap2, as they are actually installed in your active environment, for the project you are working in.

- **Local-first:** no account, no network, no telemetry, no LLM required.
- **Version-aware:** options come from the `--help` of the binary you really run (conda, mamba, micromamba, virtualenv).
- **Project-aware:** suggests files of the expected format, pairs R1/R2 mates, and derives output names.
- **Keeps general completion:** git, cd, ls… still work; bio tools come first.

> **Status: 1.0.** Options, subcommands and values of 10 bio tools come from the Catalog, filtered by the version really installed in the active environment (followed across `conda activate`), and ranked for the project you are in: files of the expected format, R1/R2 mates, derived output names, reference indexes, and the options you use most. See the [user guide](./docs/guide.md), the [changelog](./CHANGELOG.md) and the [specification](./biopilot-cli-cahier-des-charges.md) (French).

## Supported platforms

Shells: bash, zsh, fish. Systems: Linux (x64, arm64), macOS (arm64, x64), Windows through WSL.

## Install

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

Available from the first release (before it, install from the sources). No administrator rights, nothing to compile, no prerequisite: the script downloads the standalone binary for your system (Node embedded), checks its SHA-256, installs it in `~/.local/bin` and its Catalog in `~/.local/share/biopilot/`. It never edits your shell files: it prints the one line to add to `~/.bashrc`, `~/.zshrc` or `~/.config/fish/config.fish`. Open a new terminal and start typing `fastp --`.

- **A given version, another folder:** `BIOPILOT_VERSION=0.1.0` and `BIOPILOT_INSTALL_DIR=~/bin` before `sh`.
- **Update:** run the same line again; a running session asks for `biopilot reinit` when its resources are of another version.
- **Check:** `biopilot doctor` (installation, Catalog, User store, PATH, environment); `biopilot status` shows the environment, project and tool versions BioPilot detects.
- **Uninstall:** `biopilot uninstall` removes the binary, configuration, data and the init line, after showing them.

From the sources: see Development below, then `biopilot init bash` (or zsh, fish) prints the line to add.

## Documentation

- [User guide](./docs/guide.md): using BioPilot, what the suggestions are based on, the status line, every command, `.biopilot.toml`, configuration, privacy, troubleshooting.
- [Adding a tool to the Catalog](./docs/contributing-tools.md): the YAML format, ranks, rules, formats, help recordings and tests.

## Development

```shell
conda create -n biopilot-dev -c conda-forge nodejs=22 zsh fish   # zsh, fish: for e2e tests
conda activate biopilot-dev
npm ci
npm run build
npm test
npm link && npm run test:e2e   # end-to-end, in real bash/zsh/fish sessions
node build/index.js        # start a BioPilot session
```

Domain vocabulary is in [GLOSSARY.md](./GLOSSARY.md); architecture decisions in [docs/adr/](./docs/adr/).

## Credits and license

BioPilot CLI is a light fork of [Microsoft Inshellisense](https://github.com/microsoft/inshellisense). The engine (terminal, parser, rendering) is theirs; BioPilot's changes to it are listed and marked `BIOPILOT:` in the code. BioPilot is not affiliated with or endorsed by Microsoft.

MIT licensed. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
