# Project file: .biopilot.toml

BioPilot detects the project automatically. A `.biopilot.toml` file at the project root corrects the detection when needed, and always has the last word. Every key is optional; an invalid file is ignored.

```toml title=".biopilot.toml"
assay = "rna-seq"            # rna-seq | variant-calling | unknown
platform = ["illumina"]      # illumina, nanopore, or both
results_dir = "out"          # where derived output names go (default: results/ when it exists)
reference = "ref/GRCh38.fa"  # offered first wherever a reference fits
warnings = false             # no live warning of biopilot check in this project
```

| Key | Values | Effect |
|---|---|---|
| `assay` | `rna-seq`, `variant-calling`, `unknown` | adjusts which options and files rank first |
| `platform` | `["illumina"]`, `["nanopore"]` or both | adjusts the ranking for short or long reads |
| `results_dir` | a folder | where derived output names go |
| `reference` | a file | offered first wherever a reference fits |
| `warnings` | `true` or `false` | live warnings of `biopilot check` in this project |

## How a project is found

From the current folder upwards, the first folder holding `.git`, `Snakefile`, `nextflow.config`, `environment.yml` or `.biopilot.toml` is the project root. `biopilot status` shows what was detected.
