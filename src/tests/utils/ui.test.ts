// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import stripAnsi from "strip-ansi";
import { renderBox, truncateText } from "../../ui/utils";
import { getConfig } from "../../utils/config";

describe("renderBox", () => {
  let previousBoxBorderStyle: ReturnType<typeof getConfig>["boxBorderStyle"];

  beforeEach(() => {
    previousBoxBorderStyle = getConfig().boxBorderStyle;
  });

  afterEach(() => {
    getConfig().boxBorderStyle = previousBoxBorderStyle;
  });

  test("uses square corners by default", () => {
    expect(renderBox(["ab"], 4).map(stripAnsi)).toEqual(["┌──┐", "│ab│", "└──┘"]);
  });

  test("uses rounded corners when configured", () => {
    getConfig().boxBorderStyle = "rounded";

    expect(renderBox(["ab"], 4).map(stripAnsi)).toEqual(["╭──╮", "│ab│", "╰──╯"]);
  });
});

describe("truncateText", () => {
  test("handling chinese wide characters", () => {
    expect(truncateText("美国人", 10)).toBe("美国人    ");
  });

  test("truncates too long wide characters when exact", () => {
    expect(truncateText("美国人 人人", 10)).toBe("美国人 人…");
  });

  test("truncates too long wide characters when split", () => {
    expect(truncateText("美国人美国人", 10)).toBe("美国人美… ");
  });
});

describe("displayText", () => {
  test("control characters become ?, tabs and carriage returns spaces, line breaks stay", async () => {
    const { displayText } = await import("../../ui/utils");
    expect(displayText("a\x1b]52;c;x\x07b")).toBe("a?]52;c;x?b");
    expect(displayText("a\tb\rc\nd\x7fe\x9bf\x00g")).toBe("a b c\nd?e?f?g");
    expect(displayText("--min-MQ  ≥ 30 é")).toBe("--min-MQ  ≥ 30 é");
  });
});
