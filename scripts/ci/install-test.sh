#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# Phase 5 exit (ticket #59): installs the freshly packaged standalone binary with install.sh into an empty
# HOME, as on a clean machine, checks it works, then uninstalls it and checks nothing is left.
# Spec §10.2: installation under 30 s with an ordinary connection. A local release cannot measure the
# network, so two budgets: the download (the gzipped binary under 60 MB, about 24 s at 20 Mbit/s) and the
# rest of the installation, timed here.
# Usage: scripts/ci/install-test.sh   (after npm run build:db && npm run build && npm run package)

set -euo pipefail

MAX_DOWNLOAD_BYTES=60000000
MAX_INSTALL_SECONDS=30

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64 ;;
  Linux-aarch64) target=linux-arm64 ;;
  Darwin-arm64) target=darwin-arm64 ;;
  Darwin-x86_64) target=darwin-x64 ;;
  *) echo "unsupported runner $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
release="$work/release"
home="$work/home"
mkdir -p "$release" "$home"

# The release, as the release workflow publishes it.
gzip -9 -c "pkg/biopilot-$target" > "$release/biopilot-$target.gz"
(cd "$release" && { sha256sum "biopilot-$target.gz" 2> /dev/null || shasum -a 256 "biopilot-$target.gz"; } > SHA256SUMS)
size=$(wc -c < "$release/biopilot-$target.gz" | tr -d ' ')
echo "download: $size bytes (budget $MAX_DOWNLOAD_BYTES)"
[ "$size" -lt "$MAX_DOWNLOAD_BYTES" ] || { echo "the download is over budget" >&2; exit 1; }

# A clean machine: an empty HOME, only the system's own tools on PATH.
clean() { env -i HOME="$home" PATH=/usr/bin:/bin:/usr/sbin:/sbin SHELL=/bin/bash "$@"; }

start=$(date +%s)
clean BIOPILOT_DOWNLOAD_URL="file://$release" sh install.sh
seconds=$(($(date +%s) - start))
echo "installation: ${seconds} s (budget ${MAX_INSTALL_SECONDS} s)"
[ "$seconds" -lt "$MAX_INSTALL_SECONDS" ] || { echo "the installation is over budget" >&2; exit 1; }

binary="$home/.local/bin/biopilot"
clean "$binary" --version
clean "$binary" info fastp | head -3
clean "$binary" info fastp | grep -q -- "--in1" || { echo "the installed Catalog does not answer" >&2; exit 1; }

clean "$binary" uninstall --yes
left=$(find "$home" -iname '*biopilot*' | sed "s|^$home||")
if [ -n "$left" ]; then
  echo "left after uninstall:" >&2
  echo "$left" >&2
  exit 1
fi
echo "✓ installed, used and uninstalled without leftovers"
