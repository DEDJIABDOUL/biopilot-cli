# Bioconda recipe

`biopilot-cli/` is the recipe for [Bioconda](https://bioconda.github.io/), so that BioPilot installs where bioinformaticians install their tools:

```shell
conda install -c conda-forge -c bioconda biopilot-cli
biopilot init bash   # then add the line it prints at the end of ~/.bashrc
```

The recipe lives in [bioconda/bioconda-recipes](https://github.com/bioconda/bioconda-recipes), under `recipes/biopilot-cli/`. This folder is its reference copy: change it here first, in the same pull request as the release that needs it.

## What it packages

The four signed standalone binaries of the GitHub Release (`biopilot-{linux,darwin}-{x64,arm64}.gz`), the same files `install.sh` and `npm install -g biopilot-cli` install. Each is a Node.js single executable application embedding Node 22, the Catalog, and the `better-sqlite3` and `node-pty` addons built for glibc 2.28. Bioconda's toolchain is therefore not needed, and the embedded blob must not be patched: `binary_relocation` and `detect_binary_files_with_prefix` are off.

If Bioconda reviewers ask for a build from source instead, the plan is a `noarch: generic` build running `npm ci`, `npm run build:db`, `npm run build` and `npm run package` with conda-forge's `nodejs 22`, `python` and a C++ compiler; the release workflow's steps are the reference.

## Submit or update

The first submission is a pull request to bioconda-recipes adding `recipes/biopilot-cli/` with these three files. After that, Bioconda's autobump bot opens a pull request for each new GitHub Release; check that its checksums match the release's `SHA256SUMS` before approving.

For a manual update:

1. Set `version` in `meta.yaml` and reset `build: number` to 0.
2. Copy the four checksums from the release's `SHA256SUMS`, and those of `LICENSE` and `NOTICE` at the tag:

   ```shell
   gh release download vX.Y.Z -p SHA256SUMS -O -
   for f in LICENSE NOTICE; do git show vX.Y.Z:$f | sha256sum; done
   ```

3. Test locally: `bioconda-utils build recipes config.yml --packages biopilot-cli` in a bioconda-recipes clone, or run `build.sh` then `run_test.sh` by hand with `PREFIX`, `PATH` and `PKG_VERSION` set.
