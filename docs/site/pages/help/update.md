# Update and uninstall

## Update

Run the installation command again, then open a new terminal:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

Your settings and data are kept. If a terminal reports `biopilot resources out of date`, run `biopilot reinit`.

To install a specific version:

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | BIOPILOT_VERSION=1.1.4 sh
```

What changed in each version: [Changelog](https://github.com/DEDJIABDOUL/biopilot-cli/blob/main/CHANGELOG.md).

## Uninstall

```shell
biopilot uninstall
```

BioPilot lists everything it will remove and asks for confirmation: the program, its settings, its data, and the start line in your shell's startup file. The rest of your files are not touched. `biopilot uninstall --yes` skips the confirmation.
