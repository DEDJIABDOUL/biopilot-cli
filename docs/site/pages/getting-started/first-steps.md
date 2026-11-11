# First steps

## Check that BioPilot is running

Once installed, BioPilot starts by itself in every new terminal. To check:

```console
$ biopilot -c
biopilot session [live]
```

The answer is `biopilot session [live]` when BioPilot runs in this terminal, and `biopilot session [not found]` when it does not. To start it in a terminal where it is not running:

```shell
biopilot
```

## Read your tools' real options

BioPilot suggests the options of the version of each tool you really run. To read them ahead of time, run once in each conda environment:

```shell
conda activate rnaseq
biopilot sync
```

Otherwise BioPilot reads them in the background the first time you use each tool.

## Try it

In a project folder with FASTQ files, type `fastp ` and press ++tab++. See [Usage](../usage/index.md) for the keys and more examples.

## If something looks wrong

```shell
biopilot doctor
```

names each problem it finds and what to do about it. See also [Troubleshooting](../help/troubleshooting.md).
