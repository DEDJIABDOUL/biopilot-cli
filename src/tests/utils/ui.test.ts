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
