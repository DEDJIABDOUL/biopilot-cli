# Troubleshooting

Start with:

```shell
biopilot doctor
```

It names each problem it finds and what to do about it.

| Symptom | Try |
|---|---|
| `biopilot: command not found` | add `~/.local/bin` to your `PATH` (step 2 of [Installation](../getting-started/installation.md)) |
| No suggestions at all | `biopilot -c`: if not in a session, check that the start line is the **last** line of your startup file, then open a new terminal |
| `biopilot resources out of date` | `biopilot reinit` |
| Options that your version does not have | `biopilot status`: is it the program you expect? Then `biopilot sync` |
| A tool's options never become its real ones | `biopilot sync` reports `failed` when its `--help` cannot be read: the Catalog's options stay |
| Wrong files offered | `biopilot status` shows the detected project; fix it with [`.biopilot.toml`](../reference/project-config.md) |
| Anything else | start BioPilot with `biopilot -V` and read `~/.local/share/biopilot/log/biopilot.log` |

## Diagnostic commands

| Command | What it tells you |
|---|---|
| `biopilot -c` | whether BioPilot is running in this terminal |
| `biopilot doctor` | whether the installation is complete |
| `biopilot status` | the environment, the project and each tool's program, version and Profile |
| `biopilot info fastp` | what BioPilot knows about a tool, a subcommand or an option |
| `biopilot learn --list` | the tools you imported |

Still stuck? Open an issue on [GitHub](https://github.com/DEDJIABDOUL/biopilot-cli/issues) with the output of `biopilot doctor`.
