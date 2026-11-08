#!/usr/bin/env bash
# Copyright (c) BioPilot CLI contributors.
# Licensed under the MIT License.
#
# BIOPILOT: 1.1.4. The better-sqlite3 npm package ships a prebuilt Linux addon that needs glibc 2.34 and
# GCC 11's libstdc++, so the Catalog could not open on RHEL/Rocky 8, Ubuntu 20.04 or Debian 10-11. This
# rebuilds it from the package's own sources in a manylinux_2_28 container (glibc 2.28, a GCC toolset that
# links the newer parts of libstdc++ in), with the runner's Node.js, and puts it where `npm run package`
# takes it. A Node-API addon: one build serves every Node 22. force_build=1: the package skips the build
# when it ships a prebuilt addon for the host.
# Usage: scripts/ci/build-sqlite-addon.sh   (on a Linux runner, after npm ci, before npm run package)

set -euo pipefail

case "$(uname -m)" in
  x86_64) arch=x64 image="quay.io/pypa/manylinux_2_28_x86_64@sha256:ae830e2ecbf4568743f8b760920cd7483538375b6b242a9fb02b5b2ad0245f68" ;;
  aarch64) arch=arm64 image="quay.io/pypa/manylinux_2_28_aarch64@sha256:6c4f9b6d9453bb47b21b4c1e4f04f3c662584f60f4ed8455f4561a336ff19414" ;;
  *) echo "unsupported machine $(uname -m)" >&2; exit 1 ;;
esac

addon_dir=node_modules/better-sqlite3
node_root=$(dirname "$(dirname "$(command -v node)")")
node_gyp="$node_root/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js"
[ -f "$node_gyp" ] || { echo "node-gyp not found next to $(command -v node)" >&2; exit 1; }

# The runner's Node.js (an official build, itself made for glibc 2.28) runs node-gyp and gives the headers.
docker run --rm \
  -v "$PWD/$addon_dir:/addon" -v "$node_root:/opt/node:ro" -w /addon \
  -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  "$image" bash -euo pipefail -c '
    export PATH=/opt/node/bin:/opt/python/cp312-cp312/bin:$PATH
    rm -rf build
    node '"${node_gyp/#$node_root//opt/node}"' rebuild --release --nodedir=/opt/node --jobs=max -- -Dforce_build=1
    chown -R '"$(id -u):$(id -g)"' build'

cp "$addon_dir/build/Release/better_sqlite3.node" "$addon_dir/prebuilds/linux-$arch.node"
scripts/ci/check-glibc.sh "$addon_dir/prebuilds/linux-$arch.node"
