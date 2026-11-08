#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# BIOPILOT: 1.1.4. Fails when a Linux binary or addon needs more than glibc 2.28 or the libstdc++ of GCC 8
# (GLIBCXX_3.4.25, CXXABI_1.3.11): the floor of the README's requirements (RHEL/Rocky 8, Ubuntu 20.04,
# Debian 10). A standalone binary is checked with every native addon embedded in it.
# Usage: scripts/ci/check-glibc.sh FILE...

set -euo pipefail

MAX_GLIBC=2.28
MAX_GLIBCXX=3.4.25
MAX_CXXABI=1.3.11

newest() { grep -oE "$1_[0-9.]+" | sed "s/^$1_//" | sort -V | tail -n 1; }
above() { [ -n "$1" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" != "$2" ]; }

status=0
check() { # name, file of an ELF object
  local symbols glibc glibcxx cxxabi
  symbols=$(objdump -T "$2" 2> /dev/null || true)
  glibc=$(newest GLIBC <<< "$symbols")
  glibcxx=$(newest GLIBCXX <<< "$symbols")
  cxxabi=$(newest CXXABI <<< "$symbols")
  echo "$1: GLIBC ${glibc:-none}, GLIBCXX ${glibcxx:-none}, CXXABI ${cxxabi:-none}"
  if above "$glibc" "$MAX_GLIBC" || above "$glibcxx" "$MAX_GLIBCXX" || above "$cxxabi" "$MAX_CXXABI"; then
    echo "::error::$1 needs more than glibc $MAX_GLIBC / GLIBCXX $MAX_GLIBCXX / CXXABI $MAX_CXXABI" >&2
    status=1
  fi
}

for file in "$@"; do
  check "$file" "$file"
  # Native addons embedded in a standalone binary: every ELF object after the first, cut at the next one.
  parts=$(mktemp -d)
  python3 -c '
import re, sys
data = open(sys.argv[1], "rb").read()
starts = [m.start() for m in re.finditer(rb"\x7fELF[\x01\x02]", data)][1:]
for i, start in enumerate(starts):
    end = starts[i + 1] if i + 1 < len(starts) else len(data)
    open(f"{sys.argv[2]}/{start}", "wb").write(data[start:end])
' "$file" "$parts"
  for part in "$parts"/*; do
    [ -e "$part" ] && check "$file@$(basename "$part")" "$part"
  done
  rm -rf "$parts"
done
exit $status
