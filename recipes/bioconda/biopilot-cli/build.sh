#!/bin/bash
set -euo pipefail

mkdir -p "${PREFIX}/bin"
# conda-build leaves a lone .gz as downloaded; decompress it if it has not done so.
binary=$(ls biopilot-*-* 2> /dev/null | head -n 1)
case "${binary}" in
  *.gz) gzip -dc "${binary}" > "${PREFIX}/bin/biopilot" ;;
  "") echo "no BioPilot binary in the sources" >&2; exit 1 ;;
  *) cp "${binary}" "${PREFIX}/bin/biopilot" ;;
esac
chmod 755 "${PREFIX}/bin/biopilot"
