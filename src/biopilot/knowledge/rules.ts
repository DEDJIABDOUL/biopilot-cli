// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

import type { RuleCondition } from "./catalog.js";
import type { Assay, Platform } from "./schema.js";

/** What a rule condition is checked against: the command line typed so far and the project. */
export type RuleContext = {
  /** Canonical names of the options already on the command line. */
  used: readonly string[];
  /** Whether the project has complete read pairs; `null` when unknown. */
  paired: boolean | null;
  /** The project's platforms (a hybrid project has several; none means generic). */
  platforms: readonly Platform[];
  assay: Assay;
};

/** A rule holds when every field of its condition holds; an empty condition always holds. */
export const ruleHolds = (condition: RuleCondition, context: RuleContext): boolean =>
  condition.used.every((name) => context.used.includes(name)) &&
  (condition.paired === null || condition.paired === context.paired) &&
  (condition.platform === null || context.platforms.includes(condition.platform)) &&
  (condition.assay === null || condition.assay === context.assay);
