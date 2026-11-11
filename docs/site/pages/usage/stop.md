# Stop BioPilot

| To… | Do this |
|---|---|
| hide the suggestions for a moment | press ++esc++ |
| leave BioPilot in the current terminal | type `exit` |
| stop starting BioPilot in new terminals | comment out its start line (below) |
| remove BioPilot completely | see [Uninstall](../help/update.md#uninstall) |

!!! warning "`exit` also closes the terminal"
    BioPilot replaces your shell in the terminal it starts in, so leaving it also closes the terminal window or tab.

## Stop starting BioPilot in new terminals

Open your shell's startup file (`~/.bashrc`, `~/.zshrc` or `~/.config/fish/config.fish`), and delete its last line, the one that contains `biopilot/init`, or put a `#` in front of it. Then open a new terminal.

To use BioPilot again, remove the `#`.
