// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// install.sh (ticket #55), run for real with sh against a local release served as file://: a fake
// standalone binary and its real SHA256SUMS. Everything happens in a temporary HOME.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { tempDir } from "../helpers.js";

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const script = path.join(repoRoot, "install.sh");

/** A release folder holding a fake binary for this platform and its checksum. */
const release = (asset: string, options: { badChecksum?: boolean } = {}) => {
  const dir = tempDir();
  const binary = `#!/bin/sh
case "$1" in
  --version) echo 9.9.9 ;;
  reinit) mkdir -p "$HOME/.local/share/biopilot" && : > "$HOME/.local/share/biopilot/knowledge.db" ;;
  init) printf '\\n\\n[ -f ~/.local/share/biopilot/init/%s/init.sh ] && source ~/.local/share/biopilot/init/%s/init.sh\\n' "$2" "$2" ;;
esac
`;
  fs.writeFileSync(path.join(dir, asset), binary);
  const sum = crypto
    .createHash("sha256")
    .update(options.badChecksum ? "something else" : binary)
    .digest("hex");
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${sum}  ${asset}\n${"0".repeat(64)}  biopilot-other-arch\n`);
  return dir;
};

const install = (releaseDir: string, env: Record<string, string> = {}) => {
  const home = tempDir();
  for (const rc of [".bashrc", ".zshrc"]) fs.writeFileSync(path.join(home, rc), "# my own settings\n");
  const run = spawnSync("sh", [script], {
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: home,
      SHELL: "/bin/bash",
      BIOPILOT_DOWNLOAD_URL: `file://${releaseDir}`,
      BIOPILOT_TEST_UNAME_S: "Linux",
      BIOPILOT_TEST_UNAME_M: "x86_64",
      ...env,
    },
    encoding: "utf-8",
  });
  return { home, code: run.status, stdout: run.stdout, stderr: run.stderr };
};

describe("install.sh", () => {
  test("installs the binary of the platform into ~/.local/bin, with its resources, and prints the init line", () => {
    const { home, code, stdout, stderr } = install(release("biopilot-linux-x64"));
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    const binary = path.join(home, ".local", "bin", "biopilot");
    expect(fs.statSync(binary).mode & 0o111).not.toBe(0);
    expect(fs.existsSync(path.join(home, ".local", "share", "biopilot", "knowledge.db"))).toBe(true);
    expect(stdout).toContain("biopilot 9.9.9 installed");
    expect(stdout).toContain("[ -f ~/.local/share/biopilot/init/bash/init.sh ] && source ~/.local/share/biopilot/init/bash/init.sh");
    expect(stdout).toContain(path.join(home, ".bashrc"));
  });

  test("never edits shell files", () => {
    const { home } = install(release("biopilot-linux-x64"));
    expect(fs.readFileSync(path.join(home, ".bashrc"), "utf-8")).toBe("# my own settings\n");
    expect(fs.readFileSync(path.join(home, ".zshrc"), "utf-8")).toBe("# my own settings\n");
  });

  test.each([
    ["Darwin", "arm64", "biopilot-darwin-arm64"],
    ["Darwin", "x86_64", "biopilot-darwin-x64"],
    ["Linux", "aarch64", "biopilot-linux-arm64"],
  ])("%s %s downloads %s", (system, machine, asset) => {
    expect(install(release(asset), { BIOPILOT_TEST_UNAME_S: system, BIOPILOT_TEST_UNAME_M: machine }).code).toBe(0);
  });

  test("a checksum mismatch installs nothing", () => {
    const { home, code, stderr } = install(release("biopilot-linux-x64", { badChecksum: true }));
    expect(code).toBe(1);
    expect(stderr).toContain("checksum mismatch");
    expect(fs.existsSync(path.join(home, ".local", "bin", "biopilot"))).toBe(false);
  });

  test.each([
    ["an unsupported system", { BIOPILOT_TEST_UNAME_S: "FreeBSD" }, "unsupported system: FreeBSD"],
    ["an unsupported architecture", { BIOPILOT_TEST_UNAME_M: "i686" }, "unsupported architecture: i686"],
  ])("refuses %s clearly", (_, env, message) => {
    const { code, stderr } = install(release("biopilot-linux-x64"), env);
    expect(code).toBe(1);
    expect(stderr).toContain(message);
  });

  test("a missing download is an error, not a broken install", () => {
    const { home, code, stderr } = install(tempDir());
    expect(code).toBe(1);
    expect(stderr).toContain("could not download");
    expect(fs.existsSync(path.join(home, ".local", "bin", "biopilot"))).toBe(false);
  });

  test("BIOPILOT_INSTALL_DIR chooses the folder; a folder off PATH is warned about", () => {
    const dir = path.join(tempDir(), "tools");
    const { code, stdout } = install(release("biopilot-linux-x64"), { BIOPILOT_INSTALL_DIR: dir });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, "biopilot"))).toBe(true);
    expect(stdout).toContain(`${dir} is not on your PATH`);
  });

  test("no PATH warning when the folder is on PATH", () => {
    const dir = path.join(tempDir(), "bin");
    const { stdout } = install(release("biopilot-linux-x64"), { BIOPILOT_INSTALL_DIR: dir, PATH: `${dir}:/usr/bin:/bin` });
    expect(stdout).not.toContain("is not on your PATH");
  });
});
