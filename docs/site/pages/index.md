---
title: Home
hide:
  - navigation
  - toc
---

<div class="bp-hero" markdown>

# Autocompletion that knows your <em>bioinformatics</em> tools.

<p class="bp-lede">While you type, BioPilot suggests the options, files and values that fit fastp, samtools, bwa or minimap2, as they are actually installed in your active environment, for the project you are working in.</p>

[Install BioPilot](getting-started/installation.md){ .md-button .md-button--primary }
[Browse the commands](commands/index.md){ .md-button }

<div class="bp-demo">
  <div class="bp-bar" aria-hidden="true"><i></i><i></i><i></i></div>
  <img src="assets/demo.gif" width="1175" height="470" alt="BioPilot in a terminal: typing fastp offers --in1 first, then the read 1 file, then --in2 and its mate, then a derived output name in results/; bwa mem is offered the reference index; biopilot search finds fastp's adapter options. Under the suggestions, the status line names fastp 0.23.4 from the conda environment rnaseq.">
</div>

</div>

<div class="grid cards" markdown>

-   <span class="bp-k">Local</span>
    **Private by design**

    No account, no network access, no telemetry, no AI service. Everything runs on your machine.

-   <span class="bp-k">Versioned</span>
    **Follows your environment**

    Options come from the version of the tool you really run, and follow `conda activate`.

-   <span class="bp-k">Project</span>
    **Knows your files**

    Files of the expected format first, R1/R2 mates paired, output names derived from inputs.

-   <span class="bp-k">Careful</span>
    **Checks before you run**

    `biopilot check` warns about mismatched read pairs, missing files and too many threads before a job fails hours later.

</div>

## Install in one line

```shell
curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
```

Then add the start line to your shell: see [Installation](getting-started/installation.md).

## Where to go next

<div class="grid cards" markdown>

-   :octicons-rocket-24:{ .bp-icon } **[Get started](getting-started/index.md)**

    Requirements, installation on Linux, macOS and Windows (WSL), first steps.

-   :octicons-command-palette-24:{ .bp-icon } **[Usage](usage/index.md)**

    Keys, examples, how suggestions are chosen, the status line, checking a command.

-   :octicons-terminal-24:{ .bp-icon } **[Commands](commands/index.md)**

    Every `biopilot` command, with its options and examples.

-   :octicons-gear-24:{ .bp-icon } **[Reference](reference/index.md)**

    `.biopilot.toml`, `rc.toml`, the 44 supported tools, privacy.

-   :octicons-question-24:{ .bp-icon } **[Help](help/index.md)**

    Update, uninstall, troubleshooting and the FAQ.

-   :octicons-mark-github-24:{ .bp-icon } **[GitHub](https://github.com/DEDJIABDOUL/biopilot-cli)**

    Source code, releases, issues and tool requests.

</div>
