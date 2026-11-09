# Contributing to BioPilot CLI

Thank you for helping. BioPilot is useful only if it knows the tools you use, so the most valuable contribution is often the smallest one: **one tool, described in one YAML file**.

## Ways to contribute

| You want to | Do this | Time |
|---|---|---|
| Ask for a tool to be supported | Open a [tool request](https://github.com/DEDJIABDOUL/biopilot-cli/issues/new?template=new_tool.md) with the output of its `--help` | 5 min |
| Add a tool to the Catalog | Follow [Adding a tool to the Catalog](./docs/contributing-tools.md): one recorded help, one YAML file | 15–60 min |
| Report a wrong or missing suggestion | Open a [bug report](https://github.com/DEDJIABDOUL/biopilot-cli/issues/new?template=bug_report.md) with what you typed, what you expected and `biopilot status` | 5 min |
| Fix a bug or build a feature | Pick an issue labelled `good first issue` or `help wanted`, say in a comment that you take it, then open a pull request | varies |
| Report a security problem | **Do not open an issue.** See [SECURITY.md](./SECURITY.md) | — |

Issues labelled `ready-for-agent` or `ready-for-human` are fully specified and can be started. Issues labelled `needs-triage` or `needs-info` are still being discussed: comment there first.

## Set up the development environment

BioPilot is written in TypeScript and runs on Node.js 22. With conda:

```shell
git clone https://github.com/DEDJIABDOUL/biopilot-cli.git
cd biopilot-cli
conda create -n biopilot-dev -c conda-forge nodejs=22 zsh fish
conda activate biopilot-dev
npm ci
npm run build:db     # compiles knowledge/tools/*.yml into the Catalog
npm run build
npm test
node build/index.js  # starts a BioPilot session from your build
```

| Command | What it checks |
|---|---|
| `npm test` | unit tests, including every Catalog YAML against its recorded help |
| `npm run test:e2e` | end-to-end tests in real bash, zsh and fish sessions |
| `npm run lint` | ESLint and Prettier |
| `npm run perf:targets` | the performance targets (session startup, suggestion latency, memory) |

Read [GLOSSARY.md](./GLOSSARY.md) before naming things: a *Catalog Tool*, a *Profile*, the *User store* have precise meanings. Architecture decisions are in [docs/adr/](./docs/adr/). The full specification is [biopilot-cli-cahier-des-charges.md](./biopilot-cli-cahier-des-charges.md) (in French).

## Design rules a change must keep

These are not negotiable; a pull request that breaks one will be asked to change.

- **Local-first.** No network access at run time, no telemetry.
- **The binary decides.** Suggested options come from the installed version of the tool; the Catalog adds ranking, types and rules.
- **Never run what the user merely types.** Only a Catalog tool's declared help and version commands, or a tool imported with `biopilot learn`, are ever run.
- **Fail silently.** An error in BioPilot must never block the terminal.
- **Nothing costly on each keystroke.** No blocking process, no full disk scan while typing.
- **Only file names are read**, never the content of data files, unless a feature is explicitly opt-in.

## Pull requests

1. Branch from `main` (`fix/…`, `feat/…`, `catalog/<tool>`, `docs/…`).
2. Keep one subject per pull request. A new tool and an engine change are two pull requests.
3. Add or update tests. A Catalog tool needs its recorded help under `knowledge/help/<tool>/<version>/`.
4. Add a line under **Unreleased** in [CHANGELOG.md](./CHANGELOG.md) for any change a user can see.
5. Code from the original Inshellisense engine is changed only where needed, and each change is marked with a `// BIOPILOT:` comment saying why.
6. CI must be green: lint, unit tests, end-to-end tests, performance targets.

A maintainer answers a new pull request or issue within a few days. Releases follow the cadence described in [docs/releasing.md](./docs/releasing.md): a merged change ships in the next scheduled release, not immediately.

## Recorded helps and licences

Recorded `--help` outputs are kept unedited as test data, under the tool's own licence, credited in their `RECORDING.yml`. Descriptions in the Catalog YAML are written in your own words, not copied from the tool's documentation.

## Credit

Every contributor is listed in the release notes of the version that ships their work. By contributing, you agree that your contribution is released under the [MIT license](./LICENSE), and you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
