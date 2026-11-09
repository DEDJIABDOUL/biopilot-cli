#!/bin/bash
set -euo pipefail

biopilot --version | grep -F "${PKG_VERSION}"
# Unpacks the Catalog and shell resources, as install.sh does, into a throwaway data directory.
export XDG_DATA_HOME="$(mktemp -d)"
biopilot reinit
biopilot info fastp > /dev/null
biopilot search adapter --tool fastp | grep -F -- "--adapter_sequence"
biopilot init bash | grep -F biopilot
