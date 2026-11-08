#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# BIOPILOT: 1.1.4. Runs the packaged Linux binary on the oldest systems the README supports, in containers:
# Rocky Linux 8 (glibc 2.28, GCC 8) and Ubuntu 20.04 (glibc 2.31). It must open its Catalog and the User
# store there (SQLite), not only print its version.
# Usage: scripts/ci/old-distros-test.sh pkg/biopilot-linux-x64

set -euo pipefail

binary=$(realpath "$1")
images=(
  "rockylinux/rockylinux:8@sha256:e8a49c5403b687db05d4d67333fa45808fbe74f36e683cec7abb1f7d0f2338c6"
  "ubuntu:20.04@sha256:8feb4d8ca5354def3d8fce243717141ce31e2c428701f6682bd2fafe15388214"
)

for image in "${images[@]}"; do
  echo "== ${image%@*}"
  docker run --rm -v "$binary:/usr/local/bin/biopilot:ro" -e HOME=/tmp/home "$image" sh -euc '
    mkdir -p "$HOME"
    biopilot --version
    biopilot reinit > /dev/null
    biopilot info fastp | head -n 3
    biopilot search adapter --tool fastp | head -n 3
    biopilot status > /dev/null
    biopilot learn --list > /dev/null
    test -s "$HOME/.local/share/biopilot/knowledge.db"'
done
