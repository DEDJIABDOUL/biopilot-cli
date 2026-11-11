# biopilot

Start a BioPilot session in the current terminal.

```text
biopilot [-c] [-V] [-s <shell>] [-l]
```

The start line in your shell's startup file runs `biopilot` in every new terminal. Run it by hand only in a terminal where BioPilot is not running.

## Options

| Option | Effect |
|---|---|
| `-c`, `--check` | tell whether this terminal runs in a BioPilot session, then exit |
| `-V`, `--verbose` | start a session with verbose logging, written to `~/.local/share/biopilot/log/biopilot.log` |
| `-s`, `--shell <shell>` | start the session with this shell: `bash`, `zsh` or `fish` |
| `-l`, `--login` | start the shell as a login shell |
| `-h`, `--help` | show the help |

## Examples

```console
$ biopilot -c
biopilot session [live]
```

```shell
biopilot -V   # start a session with a detailed log
```

## See also

[First steps](../getting-started/first-steps.md) · [Stop BioPilot](../usage/stop.md) · [Troubleshooting](../help/troubleshooting.md)
