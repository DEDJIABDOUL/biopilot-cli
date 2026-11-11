# biopilot info

Show what the Catalog knows about a tool, a subcommand or an option.

```text
biopilot info [--json] [tool] [command…] [option]
```

## Options

| Option | Effect |
|---|---|
| `--json` | print the result as JSON |

## Examples

```shell
biopilot info fastp              # a tool
biopilot info samtools sort      # a subcommand
biopilot info samtools sort -o   # an option
biopilot info --json bwa mem
```

## See also

[Supported tools](../reference/tools.md) · [`search`](search.md)
