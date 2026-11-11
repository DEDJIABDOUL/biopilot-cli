# Commands

| Command | What it does |
|---|---|
| [`biopilot`](biopilot.md) | start a session in the current terminal; session flags `-c`, `-V`, `-s`, `-l` |
| [`biopilot init <shell>`](init.md) | prepare the shell plugin and print the start line |
| [`biopilot reinit`](reinit.md) | reinstall the resources after an update; your data is kept |
| [`biopilot doctor`](doctor.md) | check the installation |
| [`biopilot status`](status.md) | show the environment, the project and the tools detected |
| [`biopilot sync`](sync.md) | read the real options of the active environment's tools |
| [`biopilot check`](check.md) | warnings about a command before it runs |
| [`biopilot info`](info.md) | what the Catalog knows about a tool, a subcommand or an option |
| [`biopilot learn`](learn.md) | import an installed tool that is not in the Catalog |
| [`biopilot search`](search.md) | find options by their names and descriptions |
| [`biopilot reset-usage`](reset-usage.md) | erase the usage statistics |
| [`biopilot uninstall`](uninstall.md) | remove BioPilot entirely |

!!! note "BioPilot's flags go before the tool name"
    In `biopilot info fastp --json`, `--json` is read as fastp's option, not BioPilot's. Write `biopilot info --json fastp`.
