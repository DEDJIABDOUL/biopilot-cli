// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Constants
const PKG_DIR = "pkg";
const SCRIPTS_DIR = "scripts";

const getVersion = (): string => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  return packageJson.version;
};

const copyFiles = (): void => {
  fs.mkdirSync(PKG_DIR, { recursive: true }); // BIOPILOT: the npm job packs it from a fresh checkout
  // BIOPILOT: only what users need, never the repository's working documents (CLAUDE.md, the specification).
  for (const file of ["README.md", "CHANGELOG.md", "LICENSE", "NOTICE"]) {
    fs.copyFileSync(file, path.join(PKG_DIR, file));
  }
  fs.copyFileSync(path.join(SCRIPTS_DIR, "bin.js"), path.join(PKG_DIR, "bin.js"));
};

const generatePackageJson = (): void => {
  const packageJson = {
    name: `biopilot-cli`,
    version: getVersion(),
    description: "Terminal autocompletion for bioinformatics tools",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/DEDJIABDOUL/biopilot-cli.git",
    },
    author: {
      name: "BioPilot CLI contributors",
    },
    bugs: {
      url: "https://github.com/DEDJIABDOUL/biopilot-cli/issues",
    },
    bin: {
      biopilot: "bin.js",
    },
    files: ["README.md", "CHANGELOG.md", "LICENSE", "NOTICE", "bin.js"],
    optionalDependencies: {
      "biopilot-cli-darwin-x64": getVersion(),
      "biopilot-cli-darwin-arm64": getVersion(),
      "biopilot-cli-linux-x64": getVersion(),
      "biopilot-cli-linux-arm64": getVersion(),
      // BIOPILOT: no native Windows (WSL is Linux).
    },
  };
  fs.writeFileSync(path.join(PKG_DIR, "package.json"), JSON.stringify(packageJson, null, 2), "utf-8");
};

const packageBase = (): void => {
  execSync(`cd ${PKG_DIR} && npm pack`, { stdio: "inherit" });
};

const main = async (): Promise<void> => {
  copyFiles();
  generatePackageJson();
  packageBase();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
