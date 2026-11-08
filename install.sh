#!/bin/sh
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# Installs BioPilot CLI, terminal autocompletion for bioinformatics (spec §10):
#
#   curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
#
# Downloads the standalone binary of this system (Node embedded, nothing to compile) from the GitHub
# Release, checks the release's signature and the binary's SHA-256, installs it in ~/.local/bin and its
# resources (Catalog included) in
# ~/.local/share/biopilot, then prints the one line to add to your shell. Never uses sudo, never edits
# your shell files. Rerun it to update.
#
# Environment:
#   BIOPILOT_VERSION       version to install (e.g. 0.1.0); the latest release by default
#   BIOPILOT_INSTALL_DIR   folder for the binary; ~/.local/bin by default
#   BIOPILOT_DOWNLOAD_URL  base URL of the release files (mirrors, tests); overrides BIOPILOT_VERSION

set -eu

REPOSITORY="DEDJIABDOUL/biopilot-cli"

# The release signing key (ECDSA P-256): SHA256SUMS is signed with its private half when a release is
# built, so a download that did not come from a BioPilot release is refused. Same key as
# scripts/release-signing-key.pub.pem in the repository.
RELEASE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5oSlFneA6+X+oYY4q+O10mGp0wiV
AfHjzoI4/1EsAc/Q7TU0Y/ZKhDIJXpN7zVmZgvIHZ0m0+vA0XUbNnT8o8w==
-----END PUBLIC KEY-----"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'biopilot install: %s\n' "$*" >&2
  exit 1
}

# --- What to download ------------------------------------------------------------------------------
system=${BIOPILOT_TEST_UNAME_S:-$(uname -s)}
machine=${BIOPILOT_TEST_UNAME_M:-$(uname -m)}
case "$system" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "unsupported system: $system (Linux and macOS are supported; on Windows, use WSL)" ;;
esac
case "$machine" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "unsupported architecture: $machine (x86_64 and arm64 are supported)" ;;
esac
binary_name="biopilot-$os-$arch"
# Published gzip-compressed: a third of the size, and gzip is everywhere.
asset="$binary_name.gz"

if [ -n "${BIOPILOT_DOWNLOAD_URL:-}" ]; then
  base="${BIOPILOT_DOWNLOAD_URL%/}"
elif [ -n "${BIOPILOT_VERSION:-}" ]; then
  base="https://github.com/$REPOSITORY/releases/download/v${BIOPILOT_VERSION#v}"
else
  base="https://github.com/$REPOSITORY/releases/latest/download"
fi

download() {
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget > /dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "curl or wget is needed to download BioPilot"
  fi
}

sha256() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum > /dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "sha256sum or shasum is needed to check the download"
  fi
}

# --- Download and check ----------------------------------------------------------------------------
work=$(mktemp -d "${TMPDIR:-/tmp}/biopilot-install.XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM

download "$base/$asset" "$work/$asset" 2> /dev/null || fail "could not download $base/$asset"
download "$base/SHA256SUMS" "$work/SHA256SUMS" 2> /dev/null || fail "could not download $base/SHA256SUMS"
download "$base/SHA256SUMS.sig" "$work/SHA256SUMS.sig" 2> /dev/null || fail "could not download $base/SHA256SUMS.sig (the release signature)"

# The checksums must be signed by BioPilot's release key; then the binary must match them.
command -v openssl > /dev/null 2>&1 || fail "openssl is needed to check the release signature"
# Only the key written above is trusted: no setting replaces it (tests sign with a copy of this script).
printf '%s\n' "$RELEASE_PUBLIC_KEY" > "$work/release.pub.pem"
openssl dgst -sha256 -verify "$work/release.pub.pem" -signature "$work/SHA256SUMS.sig" "$work/SHA256SUMS" > /dev/null 2>&1 ||
  fail "the release signature is not valid: nothing was installed"
expected=$(awk -v file="$asset" '$2 == file || $2 == "*" file { print $1 }' "$work/SHA256SUMS")
[ -n "$expected" ] || fail "no checksum for $asset in $base/SHA256SUMS"
actual=$(sha256 "$work/$asset")
[ "$actual" = "$expected" ] || fail "checksum mismatch for $asset (expected $expected, got $actual): nothing was installed"
command -v gzip > /dev/null 2>&1 || fail "gzip is needed to unpack BioPilot"
gzip -dc "$work/$asset" > "$work/$binary_name" || fail "could not unpack $asset"

# --- Install ---------------------------------------------------------------------------------------
install_dir="${BIOPILOT_INSTALL_DIR:-$HOME/.local/bin}"
binary="$install_dir/biopilot"
mkdir -p "$install_dir" || fail "cannot create $install_dir"
# Copied next to its final place, then renamed: a running biopilot is never left half-written.
cp "$work/$binary_name" "$binary.download" || fail "cannot write to $install_dir"
chmod 755 "$binary.download"
mv -f "$binary.download" "$binary"

# Resources (shell plugins, specs, the Catalog) in ~/.local/share/biopilot; the User store is kept.
"$binary" reinit > /dev/null 2>&1 || fail "biopilot was installed in $binary, but 'biopilot reinit' failed: run it to see why"
version=$("$binary" --version 2> /dev/null || true)
say "✓ biopilot ${version:-} installed in $binary"

case ":${PATH:-}:" in
  *":$install_dir:"*) ;;
  *) say "! $install_dir is not on your PATH: add it first, e.g. export PATH=\"$install_dir:\$PATH\"" ;;
esac

# --- The one manual step ---------------------------------------------------------------------------
shell_name=$(basename "${SHELL:-}")
case "$shell_name" in
  bash) rc="$HOME/.bashrc" ;;
  zsh) rc="$HOME/.zshrc" ;;
  fish) rc="$HOME/.config/fish/config.fish" ;;
  *) rc="" ;;
esac
if [ -n "$rc" ]; then
  line=$("$binary" init "$shell_name" 2> /dev/null | awk 'NF { last = $0 } END { print last }')
  say ""
  say "To finish, add this line at the end of $rc, then open a new terminal:"
  say ""
  say "  $line"
else
  say ""
  say "To finish, run 'biopilot init bash' (or zsh, fish) and add the line it prints to your shell's startup file."
fi
