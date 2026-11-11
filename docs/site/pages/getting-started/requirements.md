# Requirements

| | Supported |
|---|---|
| Linux | x86_64 or arm64, glibc 2.28 or later (Ubuntu 20.04+, Debian 10+, Rocky or RHEL 8+) |
| macOS | 11 (Big Sur) or later, Apple silicon or Intel |
| Windows | Windows 10 or 11 through WSL 2, with a Linux distribution such as Ubuntu |
| Shell | bash, zsh or fish |
| Tools | `curl` or `wget`, `gzip`, `openssl`, and `sha256sum` or `shasum`; they come with these systems |
| Disk space | about 250 MB |

You do not need administrator rights, Node.js, a compiler or a network connection after installation.

!!! tip "HPC clusters"
    BioPilot installs without `sudo` and runs on glibc 2.28 systems (RHEL, Rocky and Alma Linux 8), common on compute clusters. Each release is tested on Rocky Linux 8 and Ubuntu 20.04.
