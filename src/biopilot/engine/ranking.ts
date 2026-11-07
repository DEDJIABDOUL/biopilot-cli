// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// Context rules in the engine's ranking: priority = Rank + boosts of the rules that hold (spec §8.3).
// Usage statistics join in phase 4.

import type { Rule } from "../knowledge/catalog.js";
import { ruleHolds, type RuleContext } from "../knowledge/rules.js";

/** What BioPilot knows about an option of a Catalog spec, beyond what Fig carries. */
export type OptionRanking = { canonicalName: string; rules: Rule[]; deprecated: boolean };

/** Attached to the Fig options built from the Catalog; Fig options from other specs have none. */
export const optionRanking = new WeakMap<Fig.Option, OptionRanking>();

/** The project, unknown until phase 4: rules on paired, platform or assay don't fire yet. */
const UNKNOWN_PROJECT: Omit<RuleContext, "used"> = { paired: null, platforms: [], assay: "unknown" };

type Ranked = { allNames: string[]; priority: number };

/**
 * Adds to each option suggestion the boosts of its rules that hold, given the option tokens already on the line.
 * Suggestions whose option isn't from the Catalog, or is deprecated, are left as they are.
 */
export const boostOptionSuggestions = <S extends Ranked>(suggestions: S[], options: readonly Fig.Option[], usedTokens: readonly string[]): S[] => {
  const byName = new Map<string, Fig.Option>();
  for (const option of options) for (const name of typeof option.name === "string" ? [option.name] : option.name) byName.set(name, option);
  const used = usedTokens.flatMap((token) => {
    const option = byName.get(token);
    const ranking = option ? optionRanking.get(option) : undefined;
    return ranking ? [ranking.canonicalName] : [];
  });
  const context: RuleContext = { ...UNKNOWN_PROJECT, used };
  return suggestions.map((suggestion) => {
    const option = suggestion.allNames.map((name) => byName.get(name)).find((found) => found !== undefined);
    const ranking = option ? optionRanking.get(option) : undefined;
    if (!ranking || ranking.deprecated || ranking.rules.length === 0) return suggestion;
    const boost = ranking.rules.reduce((sum, rule) => (ruleHolds(rule.when, context) ? sum + rule.boost : sum), 0);
    // Floor at 0: below that sit only the deprecated options, which must stay last.
    return boost === 0 ? suggestion : { ...suggestion, priority: Math.max(0, suggestion.priority + boost) };
  });
};
