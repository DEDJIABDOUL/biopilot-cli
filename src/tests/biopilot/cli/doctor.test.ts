// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// `biopilot doctor`'s BioPilot checks (ticket #58): Catalog, User store, the binary's folder on PATH, the
// active environment and the Catalog Tools found in it.

import fs from "node:fs";
import path from "node:path";
import { installationChecks } from "../../../biopilot/cli/doctor.js";
import { openUserStore } from "../../../biopilot/profile/userStore.js";
import { FASTP, SAMTOOLS, compileValid, tempDir, writeFakeCondaEnv, writeFakeTool } from "../helpers.js";

const catalogPath = compileValid({ "fastp.yml": FASTP, "samtools.yml": SAMTOOLS });
const check = (overrides: Partial<Parameters<typeof installationChecks>[0]>) =>
  installationChecks({ env: { PATH: "" }, catalogPath, userStoreFile: path.join(tempDir(), "user.db"), standaloneBinary: null, ...overrides });
const texts = (checks: ReturnType<typeof installationChecks>, level: string) => checks.filter((c) => c.level === level).map((c) => c.text);

describe("biopilot doctor: BioPilot's checks", () => {
  test("the Catalog: available, or an error saying to reinstall it", () => {
    expect(texts(check({}), "ok").join("\n")).toMatch(/Catalog available \(2 tools/);
    const missing = check({ catalogPath: path.join(tempDir(), "none.db") });
    expect(missing.find((c) => c.level === "error")).toMatchObject({
      text: expect.stringMatching(/^the Catalog is unavailable/),
      hint: expect.stringContaining("biopilot reinit"),
    });
  });

  test("the User store: none yet is fine; readable is reported; a broken one is an error", () => {
    expect(texts(check({}), "ok").join("\n")).toContain("no User store yet");
    const good = path.join(tempDir(), "user.db");
    openUserStore({ create: true, file: good })?.close();
    expect(texts(check({ userStoreFile: good }), "ok").join("\n")).toContain(`User store readable (${good})`);
    const broken = path.join(tempDir(), "user.db");
    fs.writeFileSync(broken, "not a database");
    expect(texts(check({ userStoreFile: broken }), "error").join("\n")).toContain(`the User store ${broken} cannot be read`);
  });

  test("the standalone binary's folder must be on PATH, else a warning", () => {
    const bin = path.join(tempDir(), "bin");
    const binary = path.join(bin, "biopilot");
    expect(texts(check({ standaloneBinary: binary, env: { PATH: "/usr/bin" } }), "warning").join("\n")).toContain(`${bin} is not on your PATH`);
    expect(texts(check({ standaloneBinary: binary, env: { PATH: `${bin}:/usr/bin` } }), "warning")).toEqual([]);
  });

  test("the active environment and the Catalog Tools found in it", () => {
    const env = writeFakeCondaEnv(tempDir(), "rnaseq", "fastp", "0.23.4");
    writeFakeTool(env.bin, "fastp", {});
    const checks = check({ env: { PATH: env.bin, CONDA_PREFIX: env.prefix, CONDA_DEFAULT_ENV: "rnaseq" } });
    expect(texts(checks, "ok").join("\n")).toContain(`environment rnaseq (${env.prefix}): 1 of 2 Catalog tools installed (fastp)`);
    expect(texts(check({}), "ok").join("\n")).toContain("no conda environment active: 0 of 2 Catalog tools installed");
  });

  test("only errors count: warnings and missing tools never fail doctor", () => {
    const checks = check({ standaloneBinary: "/nowhere/bin/biopilot" });
    expect(checks.filter((c) => c.level === "error")).toEqual([]);
  });
});
