# Privacy

What BioPilot reads, runs and stores.

!!! note "No network, no telemetry, ever"
    Everything happens on your machine. There is no account and no AI service.

## Reads

- File and folder **names** of the current project: depth 3, 2 000 entries at most; hidden folders, `node_modules`, `work/` and `.snakemake/` are skipped.
- The content of `environment.yml` (64 KB at most) and `.biopilot.toml` only.
- **Never** the content of your data files.

## Runs

- Only the Catalog tools and the tools you imported with `biopilot learn`, found in your `PATH`, and only with their declared version and help commands (`fastp --version`, `fastp --help`): standard input closed, 2.5 s at most, stopped together with anything they started.
- Relative `PATH` entries are ignored, so the current folder never decides what runs.
- For other commands, the completion specs BioPilot inherits from Inshellisense may run the command you are typing to list its values: `git checkout ` runs `git branch` and `git tag` to offer branches and tags.

Text from outside BioPilot (file names, tools' helps) is shown with its control characters replaced by `?`, so it can never send commands to your terminal.

## Stores

In `~/.local/share/biopilot/user.db`, readable by you only:

- the Profiles (the options of each tool version);
- the versions found;
- how often you accepted each option.

`biopilot reset-usage` erases the usage; `biopilot uninstall` erases everything.
