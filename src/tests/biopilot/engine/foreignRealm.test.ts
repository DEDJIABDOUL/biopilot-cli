// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine tells arrays apart with `instanceof Array`. Under Jest, each test file has its own JS realm, but
// the SQLite addon is loaded once per worker: the Catalog's rows can then be arrays of another realm (#36).
// The spec built from the Catalog must hand the engine arrays of its own realm whatever the rows' realm.

import { jest } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Shell } from "../../../utils/shell.js";
import { SAMTOOLS, TRIMMER, compileValid, hideInstalledTools } from "../helpers.js";

const ForeignArray = vm.runInNewContext("Array") as ArrayConstructor;

/** Every array a reader call returns, rebuilt in another realm. */
const foreign = <T extends object>(target: T): T =>
  new Proxy(target, {
    get(object, key, receiver) {
      const value = Reflect.get(object, key, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(object, args);
        return Array.isArray(result) ? ForeignArray.from(result) : result;
      };
    },
  });

const catalogModule = await import("../../../biopilot/knowledge/catalog.js");
jest.unstable_mockModule("../../../biopilot/knowledge/catalog.js", () => ({
  ...catalogModule,
  openCatalog: (...args: Parameters<typeof catalogModule.openCatalog>) => {
    const opened = catalogModule.openCatalog(...args);
    return opened.available ? { ...opened, catalog: foreign(opened.catalog) } : opened;
  },
}));

type Runtime = typeof import("../../../runtime/runtime.js");
let runtime: Runtime;
let cwd: string;

beforeAll(async () => {
  hideInstalledTools();
  process.env.BIOPILOT_CATALOG = compileValid({ "samtools.yml": SAMTOOLS, "trimmer.yml": TRIMMER });
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "biopilot-project-"));
  fs.writeFileSync(path.join(cwd, "reads.fq"), "");
  runtime = await import("../../../runtime/runtime.js");
});

const names = async (line: string) => ((await runtime.getSuggestions(line, cwd, Shell.Bash))?.suggestions ?? []).map((s) => s.name);

describe("Catalog rows from another JS realm", () => {
  test("a positional argument taking a file still suggests files", async () => {
    expect(await names("trimmer ")).toEqual(expect.arrayContaining(["reads.fq"]));
  });

  test("subcommands, options and values are still suggested", async () => {
    expect(await names("samtools ")).toEqual(expect.arrayContaining(["sort", "view"]));
    expect(await names("samtools sort -")).toEqual(["-o", "--threads"]);
    expect(await names("trimmer --mode ")).toEqual(["fast", "slow"]);
  });
});
