# FAQ

??? question "Does BioPilot install fastp, samtools or other tools?"
    No. It helps with the tools you already have, in a conda environment or anywhere on your `PATH`. When a tool is not installed, it still suggests the Catalog's options, and the status line says `not installed`.

??? question "Does it send my data anywhere, or use an AI service?"
    No. BioPilot has no network access, no telemetry, no account and no AI model. It reads file names, never the content of your data files. See [Privacy](../reference/privacy.md).

??? question "Does it work on an HPC cluster without root access?"
    Yes. It installs in your home folder without `sudo`, runs on glibc 2.28 and later (RHEL, Rocky and Alma Linux 8, Ubuntu 20.04, Debian 10), and `biopilot check` compares thread counts with your SLURM job's `SLURM_CPUS_PER_TASK` or the cgroup's CPU quota.

??? question "Does it follow my conda environments?"
    Yes. BioPilot follows your shell's `PATH` after each `conda activate`, finds the program you would run and its version, and suggests the options of that version.

??? question "My tool is not in the list. What can I do?"
    Run `biopilot learn <tool>` to import it from its own help; it is completed from then on. To add it to the Catalog for everyone, open a tool request on [GitHub](https://github.com/DEDJIABDOUL/biopilot-cli/issues/new/choose).

??? question "Does BioPilot run the commands I type?"
    It never runs a bioinformatics tool you merely type. It runs Catalog and learned tools only with their version and help commands, and an unknown tool only when you ask with `biopilot learn`. For general commands such as git, the inherited completion specs may run a listing command (`git branch`) to offer values.

??? question "Will a warning stop my command from running?"
    No. Live warnings appear in the status line and never block ++enter++. Turn them off with `warnings = false` in `rc.toml` or `.biopilot.toml`.

??? question "Does it replace my usual shell completion?"
    No. git, cd, ls and other commands still complete as usual; bioinformatics tools simply come first.

??? question "Why does `exit` close my terminal?"
    BioPilot replaces your shell in the terminal it starts in, so leaving it also closes the window or tab. To hide the suggestions, press ++esc++ instead.

??? question "Can I use it in PowerShell or the Windows Command Prompt?"
    No. On Windows, BioPilot runs inside WSL 2, in the same Linux environment as your bioinformatics tools. See [Installation](../getting-started/installation.md).

??? question "How do I know the downloaded program is genuine?"
    The install script checks that the release's `SHA256SUMS` is signed (ECDSA P-256) by the BioPilot release key it carries, then that the program matches its checksum. It refuses an unsigned or tampered release.

??? question "How do I cite BioPilot?"
    Use [CITATION.cff](https://github.com/DEDJIABDOUL/biopilot-cli/blob/main/CITATION.cff), or the "Cite this repository" button on GitHub.
