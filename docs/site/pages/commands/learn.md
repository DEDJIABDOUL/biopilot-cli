# biopilot learn

Import an installed tool that is not in the Catalog, from its own help.

```text
biopilot learn <tool>
biopilot learn --list
biopilot learn --forget <tool>
```

BioPilot reads the tool's root help (`--help`, `-h`, or no argument), finds its subcommands (one level, 50 at most) and how to print its version (`--version`, `-V` or `version`), and reads its options for each version. The tool is then completed like a Catalog tool, in the current session too.

## Options

| Option | Effect |
|---|---|
| `--list` | list the tools you imported |
| `--forget <tool>` | remove an imported tool |

## Examples

```shell
biopilot learn kraken2
biopilot learn --list
biopilot learn --forget kraken2
```

## See also

[Tools outside the Catalog](../usage/learn.md) · [Privacy](../reference/privacy.md)
