# Changelog

## 1.0.0

The first stable release: terminal autocompletion for bioinformatics, fitted to the tool version installed in your environment and to the project you work in.

- **Catalog** of 10 tools — bcftools, blastn, bwa, fastp, fastqc, minimap2, multiqc, porechop, salmon, samtools: options, subcommands, value types, file formats, read pairs, derived outputs and ranks; `biopilot info` shows it.
- **The installed version decides:** BioPilot follows your shell's `PATH` across `conda activate` (bash, zsh, fish), finds the binary you would run and its version, and reads its own `--help` once per version (a Profile, computed in the background or by `biopilot sync`). `biopilot status` shows what it detected.
- **The project decides the files:** files of the expected format only, R1 first, the mate of a typed R1 first, derived output names in `results/`, reference indexes as one entry; read pairs, platform and assay adjust the ranking; `.biopilot.toml` corrects the detection.
- **Your habits:** options you accept often rise (capped); `biopilot reset-usage` forgets them.
- **Status line** under a bio tool's suggestions: version, its source, environment, warnings; `statusLine = false` turns it off.
- **One-line install** (`install.sh`, standalone binaries for Linux x64/arm64 and macOS arm64/x64, SHA-256 checked, no admin rights), `biopilot doctor`, `biopilot uninstall`.
- **Measured:** every target of spec §11 checked in CI (`npm run perf:targets`): session startup +32 ms and memory +2 MB over the original engine, warm suggestions under 1 ms.
- **Offline and private:** no network, no telemetry; only file names are read; only the Catalog tools' declared help and version commands are run.

Built on [Microsoft Inshellisense](https://github.com/microsoft/inshellisense) 0.0.4 (MIT); the engine changes are listed in spec §5.

## 0.1.0

First public release: phases 0 to 5 (Catalog, version-aware and project-aware suggestions, one-line install).
