# biopilot init

Prepare the shell plugin and print the line to add to your shell's startup file.

```text
biopilot init <bash|zsh|fish>
```

The last line printed is the start line. It must be the **last line** of your startup file.

## Examples

```shell
biopilot init bash | tail -n 1 >> ~/.bashrc
biopilot init zsh  | tail -n 1 >> ~/.zshrc
biopilot init fish | tail -n 1 >> ~/.config/fish/config.fish
```

## See also

[Installation](../getting-started/installation.md) · [`reinit`](reinit.md)
