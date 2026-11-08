// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ISTerm } from "../../isterm/pty.js";
import type { SuggestionBlob } from "../../runtime/model.js";
import { Shell } from "../../utils/shell.js";
import { SuggestionManager } from "../../ui/suggestionManager.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const blob = (name: string): SuggestionBlob => ({
  suggestions: [{ name, allNames: [name], icon: "*", priority: 50 }],
});

test("does not commit stale suggestions when a generator ignores cancellation", async () => {
  let commandText = "first";
  const first = deferred<SuggestionBlob>();
  const second = deferred<SuggestionBlob>();
  const terminal = {
    cwd: process.cwd(),
    cols: 80,
    getCommandState: () => ({ commandText, cursorTerminated: true, hasOutput: false }),
    getCursorState: () => ({ cursorX: 0 }),
  } as unknown as ISTerm;
  const runtime = Promise.resolve({
    getSuggestions: async (command: string) => (command === "first" ? first.promise : second.promise),
    clearTransientSuggestionState: () => {},
  });
  const manager = new SuggestionManager(terminal, Shell.Bash, runtime);

  const firstRequest = manager.exec();
  await Promise.resolve();
  commandText = "second";
  manager.invalidate();
  const secondRequest = manager.exec();

  first.resolve(blob("stale"));
  await expect(firstRequest).resolves.toBe(false);
  second.resolve(blob("current"));
  await expect(secondRequest).resolves.toBe(true);

  const rendered = manager
    .render("below", 0)
    .map((patch) => patch.data)
    .join("\n");
  expect(rendered).toContain("current");
  expect(rendered).not.toContain("stale");
});

test("clears prompt-scoped generator state when the command ends", async () => {
  let commandText: string | undefined = "first";
  let clearCalls = 0;
  const terminal = {
    cwd: process.cwd(),
    cols: 80,
    getCommandState: () => ({ commandText, cursorTerminated: true, hasOutput: false }),
    getCursorState: () => ({ cursorX: 0 }),
  } as unknown as ISTerm;
  const runtime = Promise.resolve({
    getSuggestions: async () => blob("current"),
    clearTransientSuggestionState: () => {
      clearCalls += 1;
    },
  });
  const manager = new SuggestionManager(terminal, Shell.Bash, runtime);

  await manager.exec();
  commandText = undefined;
  await manager.exec();

  expect(clearCalls).toBe(1);
});

test("does not consume suggestion bindings while the UI is hidden", async () => {
  const writes: string[] = [];
  const terminal = {
    cwd: process.cwd(),
    cols: 80,
    write: (data: string) => writes.push(data),
    getCommandState: () => ({ commandText: "first", cursorTerminated: true, hasOutput: false }),
    getCursorState: () => ({ cursorX: 0 }),
  } as unknown as ISTerm;
  const runtime = Promise.resolve({
    getSuggestions: async () => blob("current"),
  });
  const manager = new SuggestionManager(terminal, Shell.Bash, runtime);
  await manager.exec();

  expect(manager.update({ name: "tab", sequence: "\t", shift: false, ctrl: false }, false)).toBe(false);
  expect(writes).toEqual([]);
});

test("does not consume suggestion bindings when the UI is hidden", async () => {
  const writes: string[] = [];
  const terminal = {
    cwd: process.cwd(),
    cols: 80,
    write: (data: string) => writes.push(data),
    getCommandState: () => ({ commandText: "first", cursorTerminated: true, hasOutput: false }),
    getCursorState: () => ({ cursorX: 0 }),
  } as unknown as ISTerm;
  const runtime = Promise.resolve({
    getSuggestions: async () => blob("current"),
  });
  const manager = new SuggestionManager(terminal, Shell.Bash, runtime);
  await manager.exec();

  expect(manager.update({ name: "tab", sequence: "\t", shift: false, ctrl: false }, false)).toBe(false);
  expect(writes).toEqual([]);
});

// BIOPILOT: file names and tools' helps come from outside BioPilot; their control characters must not reach
// the terminal (OSC 52 would write the clipboard, OSC 0 the title).
test("control characters of a suggestion's name and description are not written to the terminal", async () => {
  const osc52 = "\x1b]52;c;cGF5bG9hZA==\x07";
  const terminal = {
    cwd: process.cwd(),
    cols: 120,
    getCommandState: () => ({ commandText: "fastp -i ", cursorTerminated: true, hasOutput: false }),
    getCursorState: () => ({ cursorX: 0 }),
  } as unknown as ISTerm;
  const runtime = Promise.resolve({
    getSuggestions: async (): Promise<SuggestionBlob> => ({
      suggestions: [{ name: `reads${osc52}.fq`, allNames: [], icon: "*", priority: 50, description: `a help ${osc52}\x1b]0;title\x07\x9bline` }],
    }),
    clearTransientSuggestionState: () => {},
  });
  const manager = new SuggestionManager(terminal, Shell.Bash, runtime);
  await manager.exec();
  const rendered = manager
    .render("below", 0)
    .map((patch) => patch.data)
    .join("\n");
  expect(rendered).toContain("reads?]52;c;cGF5bG9hZA==?.fq");
  expect(rendered).not.toContain("\x1b]");
  expect(rendered).not.toContain("\x07");
  expect(rendered).not.toContain("\x9b");
});
