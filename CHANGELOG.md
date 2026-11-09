# Changelog

## Unreleased

- **`biopilot check "<command line>"`:** warnings about a command before it runs, from file names, file existence and the CPUs available: read pairs of different samples or swapped, an output overwriting an input, an output folder that does not exist, a missing input, an incomplete or missing Reference index, more threads than the CPUs of the machine, the cgroup or the SLURM job. Exit code 0, 1 or 2; `--json` in a versioned format with its JSON Schema.
- **Catalog:** the main inputs and outputs of every tool are marked (`io`), and thread-count options too (`threads`). Catalog schema version 6.

## 1.1.4

- **Fix:** on Linux systems older than glibc 2.34 — RHEL, Rocky and Alma Linux 8, Ubuntu 20.04, Debian 10 and 11, common on HPC clusters and compute servers — the Catalog could not open: the SQLite addon came prebuilt for newer systems. It is now built for glibc 2.28, as the README always said, and each release is tested on Rocky Linux 8 and Ubuntu 20.04 before it is published. Nothing changes on newer systems or on macOS.
- **Fix:** `biopilot search … | head` (or any reader that stops early) no longer ends with an `EPIPE` stack trace.

## 1.1.3

- **Security:** file names and tools' helps are shown with their control characters replaced by `?`. A file name or a help carrying an escape sequence could otherwise send commands to the terminal when BioPilot showed it (writing the clipboard with OSC 52, changing the title, moving the cursor).
- **Security:** `install.sh` trusts only the release key it carries: the `BIOPILOT_TEST_PUBLIC_KEY_FILE` setting, meant for tests, no longer replaces it.
- **Security:** a User store moved to a new data directory stays readable by its owner only.
- **Build:** js-yaml and brace-expansion of the development tools updated (high-severity advisories; they are not part of BioPilot); CI's token is read-only and checkouts keep no credentials; Dependabot also watches the npm dependencies.
- **Documentation:** for commands outside the Catalog, the completion specs inherited from Inshellisense may run the command being typed to list its values (`git checkout ` runs `git branch`); the guide and the 1.0.0 notes said otherwise.

## 1.1.2

- **Catalog: 10 more tools** for variants, intervals and annotation — bedtools (its 18 most used subcommands), tabix, bgzip, GATK (16 tools: HaplotypeCaller, GenomicsDBImport, CombineGVCFs, GenotypeGVCFs, BaseRecalibrator, ApplyBQSR, Mutect2, GetPileupSummaries, CalculateContamination, LearnReadOrientationModel, FilterMutectCalls, VariantFiltration, SelectVariants, VariantRecalibrator, ApplyVQSR, LeftAlignAndTrimVariants), freebayes, VCFtools, SnpEff, SnpSift, VEP and vcfanno — written from their recorded helps and documentation. 44 tools in all.
- **New file formats:** gVCF (`.g.vcf.gz`, offered first to GenotypeGVCFs and CombineGVCFs, and still to the tools reading VCFs), BedGraph, genome files (`.genome`, `chrom.sizes`), GATK tables, Mutect2's F1R2 counts, orientation priors and stats, VQSR tranches and recalibration files, GenomicsDB workspaces, TOML.
- **Help reader:** GATK's arguments with dashes in their names (it read 61 of HaplotypeCaller's 209), `-a|--addFilter` (SnpSift), freebayes' `-&`, `-$` and `-=`; example command lines and `java -jar` no longer read as options. Profiles of 1.1.1 are read again once.

## 1.1.1

- **Fix:** once BioPilot had read an installed tool's own help (`biopilot sync`, or in the background), options its help reader missed were no longer suggested: the index and reads of bowtie2 and hisat2 (`-x`, `-1`, `-2`, `-U`, `-S`, the `-gz`/`-bz2` outputs), the filters of `samtools view` (`-q`, `-f`, `-L`…) and of `bcftools view` (`-i`, `-e`, `-f`…), `bwa index -a`, Trimmomatic's `-threads`, `-phred33` and `-trimlog`, and options of seqtk. The help reader now reads options named only on the usage line, bcftools' `-f,   --apply-filters` and `-i/e, --include/--exclude`, a first option on the `Options:` line, and descriptions starting with `...` (samtools). A test checks every Catalog option against its tool's recorded help.
- The Profiles read by 1.1.0 are dropped once, at the first start: they are read again from your tools' helps when next needed, or at once with `biopilot sync`. Learned tools, detected versions and usage are kept.

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
- **Offline and private:** no network, no telemetry; only file names are read; of the Catalog tools, only their declared help and version commands are run (for other commands, the completion specs inherited from Inshellisense may run them to list values, e.g. `git branch` — corrected in 1.1.3).

## 0.1.0

First public release: phases 0 to 5 (Catalog, version-aware and project-aware suggestions, one-line install).
