---
name: Bug report
about: A wrong, missing or slow suggestion, an installation problem, or a crash
title: ''
labels: bug, needs-triage
assignees: ''

---

**What happened**
What you typed, what BioPilot suggested (or did), and what you expected instead.

**To reproduce**
1. In a folder containing: (e.g. `data/s1_R1.fastq.gz`, `data/s1_R2.fastq.gz`)
2. Type: (e.g. `fastp --in2 `)
3. See: 

**Environment**
- Output of `biopilot --version`:
- Output of `biopilot doctor`:
- For a tool's suggestions, output of `biopilot status` (or `biopilot info <tool>`):
- System: (e.g. Ubuntu 22.04 x86_64, macOS 14 arm64, WSL 2 Ubuntu, Rocky Linux 8 cluster node)
- Shell and version: (e.g. bash 5.2)
- Terminal: (e.g. GNOME Terminal, iTerm2, Windows Terminal, tmux)
- Installed with: install.sh / npm / conda

**Log**
If you can, start BioPilot with `biopilot -V`, reproduce, and attach the relevant lines of `~/.local/share/biopilot/log/biopilot.log`. Remove any path or sample name you do not want to share.
