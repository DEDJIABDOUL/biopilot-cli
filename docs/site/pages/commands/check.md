# biopilot check

Warn about mistakes in a command before it runs.

```text
biopilot check [--json] "<command line>"
```

It never runs the command and never reads the content of a file: only file names, whether files exist, and the CPUs available.

## Options

| Option | Effect |
|---|---|
| `--json` | print the result in a versioned JSON format (`"format": 1`) |

## Examples

```console
$ biopilot check "fastp -i data/s1_R1.fastq.gz -I data/s2_R2.fastq.gz -o out/s1.fq.gz -w 64"
⚠ -I data/s2_R2.fastq.gz is not the mate of -i data/s1_R1.fastq.gz: samples s1 and s2  [read-pair]
⚠ -o out/s1.fq.gz: the folder out does not exist  [output-folder-missing]
⚠ -w 64 asks for 64 threads; only 8 CPUs are available on this machine  [threads-above-cpus]
```

In a script:

```shell
biopilot check --json "$cmd" > /dev/null || echo "check this command first: $cmd"
```

## Exit codes

`0` without a warning, `1` with at least one, `2` when the line cannot be analysed.

## See also

[Checking a command](../usage/check.md): every rule, what is checked, and the JSON Schema.
