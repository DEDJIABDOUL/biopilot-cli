# biopilot status

Show what BioPilot detects in the current terminal.

```text
biopilot status [--json]
```

It shows the active conda environment, the detected project and, for each Catalog tool, the program found, its version and whether its real options (its Profile) are known.

## Options

| Option | Effect |
|---|---|
| `--json` | print the result as JSON, for scripts |

## Examples

```shell
biopilot status
biopilot status --json
```

Use it when BioPilot suggests options your version does not have: is the program it found the one you expect?

## See also

[How suggestions work](../usage/how-it-works.md) · [`sync`](sync.md) · [`.biopilot.toml`](../reference/project-config.md)
