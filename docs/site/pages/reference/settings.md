# Settings: rc.toml

Your personal settings live in `~/.config/biopilot/rc.toml`, or `$XDG_CONFIG_HOME/biopilot/rc.toml`.

```toml title="rc.toml"
statusLine = true                          # the status line under bio tools' suggestions
warnings = true                            # the first warning of biopilot check, in the status line
maxSuggestions = 5                         # suggestions shown at once
activeSuggestionBackgroundColor = "#7D56F4"
boxBorderStyle = "square"                  # or "rounded"
useAliases = false                         # complete your shell aliases' targets
useNerdFont = false

[bindings.acceptSuggestion]
key = "tab"
[bindings.nextSuggestion]
key = "down"
[bindings.previousSuggestion]
key = "up"
[bindings.dismissSuggestions]
key = "escape"
```

| Key | Default | Effect |
|---|---|---|
| `statusLine` | `true` | show the [status line](../usage/status-line.md) |
| `warnings` | `true` | show the first warning of `biopilot check` in the status line |
| `maxSuggestions` | `5` | number of suggestions shown at once |
| `activeSuggestionBackgroundColor` | `"#7D56F4"` | color of the highlighted suggestion |
| `boxBorderStyle` | `"square"` | border of the suggestion box: `square` or `rounded` |
| `useAliases` | `false` | complete the targets of your shell aliases |
| `useNerdFont` | `false` | use Nerd Font icons |
| `[bindings.*]` | see above | the keys to accept, move and dismiss |
