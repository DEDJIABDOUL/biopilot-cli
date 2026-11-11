# biopilot sync

Read the real options (Profiles) of the Catalog tools of the active environment.

```text
biopilot sync
```

For each Catalog tool found in your `PATH`, BioPilot reads its own `--help` once per version. Without `sync`, it does so in the background the first time you use each tool.

A tool whose help cannot be read is reported `failed`; the Catalog's options stay for it.

## Example

```shell
conda activate rnaseq
biopilot sync
```

Run it once in each environment you use.

## See also

[How suggestions work](../usage/how-it-works.md) · [`status`](status.md) · [`learn`](learn.md)
