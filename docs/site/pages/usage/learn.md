# Tools outside the Catalog

To get suggestions for an installed tool that is not among the [44 built-in tools](../reference/tools.md), import it once:

```shell
biopilot learn kraken2
```

BioPilot reads the tool's root help (`--help`, `-h`, or no argument), finds its subcommands (one level, 50 at most) and how to print its version (`--version`, `-V` or `version`), and reads its real options for each version. From then on it is completed like a built-in tool, in the current session too:

- its options rank by your usage;
- values are completed as files.

```shell
biopilot learn --list            # the tools you imported
biopilot learn --forget kraken2  # remove one
```

!!! info "BioPilot never runs a tool you merely type"
    Only `biopilot learn` runs an unknown tool, and only with its help and version commands.

To add a tool to the Catalog for everyone, with its file formats and ranks, see [Contributing](../help/contributing.md).
