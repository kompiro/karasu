import type { StyleRule, StyleSheet } from "../types/style.js";
import { selectorUsesToolVocabularyOnly } from "../builtins/tool-vocabulary.js";
import { satisfiesPropertySchema } from "./value-validator.js";

/**
 * The `.krs.style` cascade, in one place.
 *
 * Every surface that paints an entity reads the same two functions instead of
 * re-deriving the order: node/edge/deploy/org/boundary styles in
 * `resolver/style-resolver.ts`, and legend swatches in
 * `renderer/svg-builder.ts`. Re-implementing the cascade is what split the two
 * apart in #2445 — the legend sorted by the raw per-sheet `sourceIndex`, so a
 * user rule tying a builtin rule on specificity lost the tie there while
 * winning it on the node (TPL-2234: one entity, one appearance decision).
 */

/**
 * Flatten every sheet into one rule list whose `sourceIndex` is a global
 * declaration order.
 *
 * Each sheet's parser numbers its own rules from 0 (`style-parser.ts`), so the
 * raw indices collide across sheets and say nothing about which sheet came
 * first. Renumbering here is what makes "later declaration wins" mean "later
 * sheet wins" for equal specificity — the builtin sheet sits first, user sheets
 * after it (ADR-8).
 *
 * Rules are cloned rather than mutated: the builtin sheet is a cached
 * singleton shared by every compile.
 *
 * A rule whose selector names a tag or annotation outside the tool vocabulary
 * is left out here (`.krs language v2.0`, #2677): it matches nothing, on every
 * surface that reads the cascade. Its `sourceIndex` is still consumed, so the
 * declaration order of the rules that remain is unchanged.
 *
 * A declaration whose value fails its property's schema (`PROPERTY_SCHEMAS`)
 * is left out the same way (#3141): the cascade continues as if it had not
 * been written, so a weaker rule's value for that property applies, or the
 * default when none sets it. The validator reports it once, where it was
 * written. Doing it here, once, is what keeps the bounds in one table: the
 * resolver never reads a value the validator rejected, so it needs no guard
 * of its own that could disagree with the diagnostic.
 */
export function flattenSheetsInCascadeOrder(sheets: StyleSheet[]): StyleRule[] {
  let globalIndex = 0;
  const rules: StyleRule[] = [];
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      const sourceIndex = globalIndex++;
      if (!selectorUsesToolVocabularyOnly(rule.selector)) continue;
      rules.push({ ...withoutInvalidDeclarations(rule), sourceIndex });
    }
  }
  return rules;
}

/**
 * `rule` without the declarations whose value fails its schema. A rule built
 * without value nodes (hand-built in a test) has nothing to check against and
 * is returned as it is, and so is a declaration whose value the parser could
 * not classify (the parser already reported it).
 */
function withoutInvalidDeclarations(rule: StyleRule): StyleRule {
  const nodes = rule.valueNodes;
  if (!nodes) return rule;
  const invalid = Object.keys(rule.properties).filter((property) => {
    const node = nodes[property];
    return node !== undefined && !satisfiesPropertySchema(property, node);
  });
  if (invalid.length === 0) return rule;
  const properties = { ...rule.properties };
  for (const property of invalid) delete properties[property];
  return { ...rule, properties };
}

/**
 * Merge already-matched rules per property, weakest first.
 *
 * Per-property rather than "pick the single best rule": a rule that only sets
 * `shape` (icon theme) must not blank out the `background-color` a
 * same-specificity rule declared earlier — that is how icon mode lost its
 * legend colors in #1001.
 *
 * Expects `rules` to carry global `sourceIndex` values from
 * {@link flattenSheetsInCascadeOrder}. Does not mutate the input.
 */
export function mergeInCascadeOrder(rules: StyleRule[]): Record<string, string> {
  const sorted = [...rules].sort(
    (a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex,
  );
  const merged: Record<string, string> = {};
  for (const rule of sorted) Object.assign(merged, rule.properties);
  return merged;
}
