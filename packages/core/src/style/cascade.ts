import type { StyleRule, StyleSheet } from "../types/style.js";

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
 */
export function flattenSheetsInCascadeOrder(sheets: StyleSheet[]): StyleRule[] {
  let globalIndex = 0;
  const rules: StyleRule[] = [];
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      rules.push({ ...rule, sourceIndex: globalIndex++ });
    }
  }
  return rules;
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
