# BioPilot CLI

Terminal autocompletion for bioinformatics. While you type, BioPilot suggests the options, files and values that fit tools such as fastp, samtools, bwa or minimap2, as they are actually installed in your active environment, for the project you are working in.

- **Local-first:** no account, no network, no telemetry, no LLM required.
- **Version-aware:** options come from the `--help` of the binary you really run (conda, mamba, micromamba, virtualenv).
- **Project-aware:** suggests files of the expected format, pairs R1/R2 mates, and derives output names.
- **Keeps general completion:** git, cd, ls… still work; bio tools come first.

> **Status: pre-alpha (phase 0).** BioPilot currently behaves like the Inshellisense engine it is built on, renamed. Bio features land in the next phases; see the [specification](./biopilot-cli-cahier-des-charges.md) (French).

## Supported platforms

Shells: bash, zsh, fish. Systems: Linux (x64, arm64), macOS (arm64, x64), Windows through WSL.

## Getting started

```shell
biopilot init bash     # or zsh, fish
```

Add the printed `source` line to your shell startup file (`~/.bashrc`, `~/.zshrc` or `~/.config/fish/config.fish`). `biopilot doctor` checks the installation; `biopilot -c` tells you whether the current shell runs inside a BioPilot session.

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
