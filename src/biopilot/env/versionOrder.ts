// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

/**
 * Compares dotted versions part by part (`0.20.1` < `0.22.0` < `0.23.4`): numbers as numbers, other parts
 * as text, a missing part as 0. Negative, zero or positive, like a sort comparator.
 */
export const compareVersions = (a: string, b: string): number => {
  const parts = (version: string) => version.split(/[.+-]/);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const [x, y] = [left[i] ?? "0", right[i] ?? "0"];
    const [nx, ny] = [Number(x), Number(y)];
    const order = Number.isInteger(nx) && Number.isInteger(ny) ? nx - ny : x.localeCompare(y);
    if (order !== 0) return order;
  }
  return 0;
};

/** Whether a version is within an option's `since`/`until` (both included, either may be absent). */
export const withinVersions = (version: string, since: string | null, until: string | null): boolean =>
  (since === null || compareVersions(version, since) >= 0) && (until === null || compareVersions(version, until) <= 0);
