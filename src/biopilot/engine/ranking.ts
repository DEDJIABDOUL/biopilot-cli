// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The engine's ranking of Catalog options (spec §8.3): priority = Rank + boosts of the rules that hold
// + usage bonus (capped at +15).

import type { Rule } from "../knowledge/catalog.js";
import { ruleHolds, type RuleContext } from "../knowledge/rules.js";
import { projectAt } from "./catalogAccess.js";
import { usageBonus, usageCounts } from "./usage.js";

/** What BioPilot knows about an option of a Catalog spec, beyond what Fig carries. */
export type OptionRanking = {
  canonicalName: string;
  rules: Rule[];
  deprecated: boolean;
  /** Where the option belongs, for its usage: the Tool and the command path joined by spaces. */
  tool: string;
  command: string;
};

/** Attached to the Fig options built from the Catalog; Fig options from other specs have none. */
export const optionRanking = new WeakMap<Fig.Option, OptionRanking>();

/** Without a project (no folder, no Catalog), rules on paired, platform or assay don't fire. */
const UNKNOWN_PROJECT: Omit<RuleContext, "used"> = { paired: null, platforms: [], assay: "unknown" };

/** What the rules know of the project around `cwd` (spec §8.1). */
const projectContext = (cwd: string | undefined): Omit<RuleContext, "used"> => {
  const project = projectAt(cwd);
  return project ? { paired: project.paired, platforms: project.platforms, assay: project.assay } : UNKNOWN_PROJECT;
};

type Ranked = { allNames: string[]; priority: number };

/**
 * Adds to each option suggestion the boosts of its rules that hold, given the option tokens already on the
 * line and the project around `cwd`, plus its usage bonus. Suggestions whose option isn't from the Catalog,
 * or is deprecated, are left as they are.
 */
export const boostOptionSuggestions = <S extends Ranked>(
  suggestions: S[],
  options: readonly Fig.Option[],
  usedTokens: readonly string[],
  cwd?: string,
): S[] => {
  const byName = new Map<string, Fig.Option>();
  for (const option of options) for (const name of typeof option.name === "string" ? [option.name] : option.name) byName.set(name, option);
  const used = usedTokens.flatMap((token) => {
    const option = byName.get(token);
    const ranking = option ? optionRanking.get(option) : undefined;
    return ranking ? [ranking.canonicalName] : [];
  });
  const context: RuleContext = { ...projectContext(cwd), used };
  return suggestions.map((suggestion) => {
    const option = suggestion.allNames.map((name) => byName.get(name)).find((found) => found !== undefined);
    const ranking = option ? optionRanking.get(option) : undefined;
    if (!ranking || ranking.deprecated) return suggestion;
    const ruleBoost = ranking.rules.reduce((sum, rule) => (ruleHolds(rule.when, context) ? sum + rule.boost : sum), 0);
    const boost = ruleBoost + usageBonus(usageCounts(ranking.tool, ranking.command).get(ranking.canonicalName) ?? 0);
    // Floor at 0: below that sit only the deprecated options, which must stay last.
    return boost === 0 ? suggestion : { ...suggestion, priority: Math.max(0, suggestion.priority + boost) };
  });
};
