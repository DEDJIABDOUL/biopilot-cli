# Changelog

## 1.1.0

- **`biopilot learn <tool>`:** imports an installed tool that is not in the Catalog from its own help: its subcommands (one level), its version command and its real options per version. It is then completed like a built-in tool, in the session where it was learned too. `--list`, `--forget <tool>`. BioPilot never runs a tool you merely type.
- **Catalog: 10 more tools** for read QC and preprocessing — chopper, cutadapt, filtlong, mosdepth, NanoPlot, picard (its 20 most used tools), qualimap, seqkit, seqtk, trimmomatic — written from their recorded helps and documentation. The help reader also understands Picard and GATK helps.
- **Catalog: 14 more tools** for alignment and assembly — bowtie2, bowtie2-build, hisat2, hisat2-build, STAR, bwa-mem2, spades.py, megahit, flye, quast, busco, medaka, medaka_consensus, medaka_variant — and the index formats of bowtie2, hisat2, bwa-mem2 and STAR. The help reader also understands the helps of STAR, MEGAHIT and QUAST.
- **`biopilot search "<text>"`:** finds options of the Catalog and of learned tools by their names and descriptions; `--tool`, `--json`.
- **npm:** `npm install -g biopilot-cli` installs the same standalone program as the install script.
- **Signed releases:** each release's `SHA256SUMS` is signed (ECDSA P-256) by the BioPilot release key; `install.sh` checks the signature with `openssl` before trusting any checksum, and refuses an unsigned or tampered release. Releases 0.1.0 to 1.0.1 were signed after the fact.

## 1.0.1

- **Fix:** the start line added to the shell's startup file called the original engine's command (`is`) instead of `biopilot`, so every new terminal closed at once. It now starts `biopilot`, does nothing when `biopilot` is not on the `PATH`, and keeps the terminal open when the session cannot start (for example when its resources are of another version), so that `biopilot reinit` can be run.
- **Security:** a random token per session protects the environment report of the shell integration: text printed by a program can no longer redirect which binaries BioPilot runs. `toml` updated to 5.0.1.
- **Documentation:** the README explains installation on Ubuntu, macOS and Windows (WSL), how to start and stop BioPilot, the diagnostic commands and the requirements.

Updating with the install command installs the new start script; nothing else to do.

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

## 0.1.0

First public release: phases 0 to 5 (Catalog, version-aware and project-aware suggestions, one-line install).
