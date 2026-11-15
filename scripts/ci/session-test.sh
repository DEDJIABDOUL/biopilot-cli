#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# Starts a real BioPilot session with a packaged standalone binary, in an empty HOME, and checks that the
# shell answers inside it. 1.1.5 and 1.1.6 shipped binaries whose session crashed at once (pty.node not
# found, the node-pty patches of scripts/pkg.ts no longer applied); every other check passed, as they
# never open a terminal. Also checks that `biopilot create --print` creates the project and enters it.
# Usage: scripts/ci/session-test.sh <binary>

set -euo pipefail

binary=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
test -x "$binary"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
home="$work/home"
mkdir -p "$home/bin" "$home/work"
ln -s "$binary" "$home/bin/biopilot"
export HOME="$home" XDG_DATA_HOME="$home/.local/share" XDG_CONFIG_HOME="$home/.config"
export PATH="$home/bin:$PATH" LC_ALL=C
cd "$home/work"
biopilot reinit > /dev/null

# What the user types, one line at a time, once the session is up.
input() {
  sleep 5
  printf 'echo "in-session=$BIOPILOT"\r'
  sleep 1
  printf 'type -t biopilot\r'
  sleep 1
  printf 'biopilot create --print demo\r'
  sleep 4
  printf 'echo "now-in=$(pwd -P)"\r'
  sleep 1
  printf 'exit\r'
}

# A terminal for the session: util-linux script on Linux, BSD script on macOS.
if script --version > /dev/null 2>&1; then
  output=$(input | timeout 60 script -qec "biopilot -s bash" /dev/null 2>&1 || true)
else
  output=$(input | script -q /dev/null biopilot -s bash 2>&1 || true)
fi
output=$(printf '%s' "$output" | tr -d '\033\r')

fail() {
  echo "session-test: $1" >&2
  printf '%s\n' "$output" | tail -40 >&2
  exit 1
}

case "$output" in *"Failed to load native module"*) fail "the session cannot start: a native module is not found" ;; esac
case "$output" in *"in-session=1"*) ;; *) fail "the shell did not answer inside a BioPilot session" ;; esac
case "$output" in *function*) ;; *) fail "the shell integration does not define the biopilot function" ;; esac
test -d "$home/work/demo/data/raw" || fail "biopilot create --print did not create the project"
case "$output" in *"now-in=$(cd "$home/work/demo" && pwd -P)"*) ;; *) fail "biopilot create --print did not enter the project" ;; esac

echo "session-test: the session starts, and biopilot create --print creates and enters the project"
