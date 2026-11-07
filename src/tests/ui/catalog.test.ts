// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Phase 2 exit criterion (ticket #35): in a real bash session, a Catalog tool's options are suggested
// in Catalog priority.

import { jest } from "@jest/globals";
import type { TuiTest } from "@microsoft/tui-test/test";
import { compileRepositoryCatalog } from "../biopilot/helpers";
import { closeSession, startSession } from "./helpers";

const accent = "#7d56f4";

jest.retryTimes(2, { logErrorsBeforeRetry: true });

describe("[bash] Catalog tools", () => {
  let terminal: TuiTest;
  beforeEach(async () => {
    const { catalogPath } = compileRepositoryCatalog();
    terminal = await startSession({ label: "bash-catalog", shell: "bash", env: { BASH_SILENCE_DEPRECATION_WARNING: "1", BIOPILOT_CATALOG: catalogPath } }, [
      "-V",
      "-T",
      "-s",
      "bash",
    ]);
  });
  afterEach(async () => {
    await closeSession(terminal);
  });

  test("`fastp --` shows fastp's options, --in1 first", async () => {
    await terminal.type("fastp --");

    await terminal.expectText("--in1", { strict: false, bg: accent });
    await terminal.expectText("--thread", { strict: false });
  });
});
