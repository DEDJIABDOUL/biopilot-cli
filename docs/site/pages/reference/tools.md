# Supported tools

44 tools are built into the Catalog. Any other installed tool can be added with [`biopilot learn`](../commands/learn.md).

### Read QC and preprocessing

<ul class="bp-chips"><li>fastp</li><li>fastqc</li><li>multiqc</li><li>cutadapt</li><li>trimmomatic</li><li>porechop</li><li>chopper</li><li>filtlong</li><li>NanoPlot</li><li>seqkit</li><li>seqtk</li></ul>

### Alignment and quantification

<ul class="bp-chips"><li>bwa</li><li>bwa-mem2</li><li>bowtie2</li><li>bowtie2-build</li><li>hisat2</li><li>hisat2-build</li><li>STAR</li><li>minimap2</li><li>salmon</li><li>blastn</li></ul>

### Alignment files and coverage

<ul class="bp-chips"><li>samtools</li><li>picard</li><li>qualimap</li><li>mosdepth</li><li>bedtools</li><li>bgzip</li><li>tabix</li></ul>

### Variants and annotation

<ul class="bp-chips"><li>bcftools</li><li>gatk</li><li>freebayes</li><li>VCFtools (vcftools)</li><li>SnpEff (snpEff)</li><li>SnpSift</li><li>VEP (vep)</li><li>vcfanno</li></ul>

### Assembly and polishing

<ul class="bp-chips"><li>spades.py</li><li>megahit</li><li>flye</li><li>quast</li><li>busco</li><li>medaka</li><li>medaka_consensus</li><li>medaka_variant</li></ul>

## What the Catalog knows

For each tool: its options and subcommands, value types, file formats, read pairs, derived outputs, a rank for each option, its main inputs and outputs, and its thread-count options. `biopilot info <tool>` shows it.

To add a tool to the Catalog for everyone, see [Adding a tool to the Catalog](https://github.com/DEDJIABDOUL/biopilot-cli/blob/main/docs/contributing-tools.md).
