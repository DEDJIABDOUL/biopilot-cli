# BioPilot CLI

A terminal autocompletion for bioinformatics tools that suggests the options, files and values valid for the tool version actually installed and the project at hand.

## Knowledge

**Catalog**:
The curated, reviewed knowledge about bio tools that ships with each BioPilot release: their commands, options, ranks, file formats and rules. Read-only on the user's machine.
_Avoid_: Knowledge base, knowledge DB

**User store**:
Everything BioPilot learns on the user's machine: profiles, learned tools and usage. Never leaves the machine and survives Catalog updates.
_Avoid_: User database, cache

**Tool**:
An executable that BioPilot completes, such as fastp or samtools.
_Avoid_: Program, binary (a binary is one installed copy of a tool)

**Command**:
A tool's root invocation or one of its subcommands (`samtools sort`). Options belong to a command, not to a tool.
_Avoid_: Subtool, verb

**Option**:
A named switch of a command, which may have several aliases (`-i`, `--in1`). It is identified by its **canonical name**: its first long name, otherwise its first name.
_Avoid_: Flag (a flag is an option that takes no value), argument (an argument is positional)

**Rank**:
The Catalog's fixed priority of an option, from 0 to 100, set by a domain expert on a shared scale.
_Avoid_: Weight, score, priority (priority is the computed result)

**Boost**:
The amount, from −100 to +100, that a rule adds to an option's rank when its condition holds in the current context.
_Avoid_: Bonus, weight

**Reference index**:
The set of files a tool builds from a reference genome and reads as one unit, named either by a common prefix (bwa) or by a folder (salmon).
_Avoid_: Index files, database

**Learned tool**:
A tool absent from the Catalog that the user imported. BioPilot only records how to query it (subcommands, version command, help command); its options come from its profiles.
_Avoid_: Custom tool, imported tool

## Installed reality

**Profile**:
The options a given version of a command really offers, as read from its `--help`. A single profile is shared by every environment that installs that same version.
_Avoid_: Spec, help cache

**Fingerprint**:
The identity of one installed binary (real path, size, modification date), used to tell whether a known profile still applies.
_Avoid_: Hash, binary ID

## Project

**Assay**:
What a project sets out to measure, such as RNA-seq or variant calling.
_Avoid_: Analysis type, pipeline, project type

**Platform**:
A sequencing technology that produced reads, such as Illumina or Nanopore. A project can have several platforms (a hybrid assembly), and the platform is independent of the assay.
_Avoid_: Data type, technology, sequencer

**Read pair**:
Two read files from the same sequencing run, whose names are identical except for a mate marker (`_R1`/`_R2`, `_1`/`_2`…). A file is only part of a read pair if both mates exist.
_Avoid_: Paired files, pair

**Mate**:
One of the two files of a read pair, identified by its role: R1 or R2.
_Avoid_: Partner, sibling

**Warning**:
A finding of `biopilot check` about a command line before it runs: the rule that found it, its severity (warning or info), the options and arguments involved, and a one-line message. Found from file names, file existence and available CPUs only.
_Avoid_: Error, lint, alert

**Usage**:
How often the user has accepted each option, counted per canonical name.
_Avoid_: Stats, history, telemetry
