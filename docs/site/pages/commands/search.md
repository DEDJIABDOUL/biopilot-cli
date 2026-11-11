# biopilot search

Find options of the Catalog and of learned tools by their names and descriptions.

```text
biopilot search [--json] [--tool <tool>] "<text>"
```

It lists the options whose name or description contains every word of the text.

## Options

| Option | Effect |
|---|---|
| `--tool <tool>` | search the options of one tool only |
| `--json` | print a machine-readable answer |

## Examples

```shell
biopilot search "adapter"
biopilot search --tool samtools "mapping quality"
biopilot search --json "threads"
```

## See also

[`info`](info.md) · [Supported tools](../reference/tools.md)
