# The status line

Under the suggestions of a Catalog tool, a dim line tells what BioPilot detected:

```text
 fastp 0.23.4 · conda-meta · env rnaseq
 fastp (version unknown) · reading its real options…
 fastp · not installed: options from the Catalog
```

## Live warnings

While you type, the status line starts with the first warning of [`biopilot check`](check.md) for the line, if any. The word being typed is not checked until you move past it:

```text
 ⚠ -I data/s2_R2.fastq.gz is not the mate of -i data/s1_R1.fastq.gz: samples s1 and s2 · fastp 0.23.4 · conda-meta
```

!!! note "Warnings never block Enter"
    The warning only informs you. Your command runs as usual.

## Turn it off

| Setting | Where | Effect |
|---|---|---|
| `warnings = false` | [`rc.toml`](../reference/settings.md) | no live warnings anywhere |
| `warnings = false` | [`.biopilot.toml`](../reference/project-config.md) | no live warnings in this project |
| `statusLine = false` | [`rc.toml`](../reference/settings.md) | no status line at all |
