#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# 1.1 (ticket #75): `npm install -g biopilot-cli` works. Installs the packed packages (this platform's, with
# its standalone binary, and the `biopilot-cli` package choosing it) into an empty prefix and HOME, as npm
# would from the registry, then checks that biopilot answers and that uninstall leaves the binary to npm.
# Usage: scripts/ci/npm-test.sh   (after npm run build:db && npm run build && npm run package && npm run package:base)

set -euo pipefail

version=$(node -p 'require("./package.json").version')
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64 ;;
  Linux-aarch64) target=linux-arm64 ;;
  Darwin-arm64) target=darwin-arm64 ;;
  Darwin-x86_64) target=darwin-x64 ;;
  *) echo "unsupported runner $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
platform="pkg/biopilot-cli-$target-$version.tgz"
base="pkg/biopilot-cli-$version.tgz"
for file in "$platform" "$base"; do [ -f "$file" ] || { echo "missing $file: run npm run package and npm run package:base" >&2; exit 1; }; done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
prefix="$work/prefix"
home="$work/home"
mkdir -p "$home"

# The platform package first, then the main one: its optional dependency is then already satisfied.
npm install --global --prefix "$prefix" --no-audit --no-fund "$PWD/$platform" "$PWD/$base" > /dev/null
biopilot="$prefix/bin/biopilot"
run() { env -i HOME="$home" PATH="$prefix/bin:$(dirname "$(command -v node)"):/usr/bin:/bin" "$@"; }

run "$biopilot" --version | grep -qx "$version" || { echo "biopilot --version is not $version" >&2; exit 1; }
run "$biopilot" reinit > /dev/null
run "$biopilot" info fastp | grep -q -- "--in1" || { echo "the npm install does not answer from its Catalog" >&2; exit 1; }
out=$(run "$biopilot" uninstall --yes)
echo "$out" | grep -q "npm uninstall -g biopilot-cli" || { echo "uninstall does not point to npm" >&2; exit 1; }
[ -x "$biopilot" ] || { echo "uninstall removed npm's binary" >&2; exit 1; }
echo "✓ npm install -g biopilot-cli $version: runs, answers from its Catalog, uninstall leaves the binary to npm"
