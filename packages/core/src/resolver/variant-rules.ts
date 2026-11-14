import type { StyleRule } from "../types/style.js";
import { losingVariantTags } from "../builtins/icon-theme.js";
import { NON_AUTHOR_SHEET_IDS } from "../builtins/non-author-sheets.js";

/**
 * `rules` (already matched to `node`) without the rules from a sheet karasu
 * ships that name one of the node's losing variant tags ({@link losingVariantTags}).
 *
 * A node carrying two of its kind's variant tags matches both builtin variant
 * rules (`resource[table]`, `resource[api]`) at the same specificity, so the
 * cascade alone would let the one declared later in the sheet win. Dropping
 * the losing tags' rules here, before the merge, makes the first tag the author
 * wrote decide instead, in every display mode at once, because the same filter
 * runs on the builtin sheet (shape mode) and on the icon theme (icon mode).
 *
 * Only builtin rules are dropped. An author rule keeps its place in the
 * cascade, so an author's `#Orders { shape: url("api"); }` or
 * `resource[api] { … }` beats the builtin choice exactly as it beats a builtin
 * rule on a single-variant node (#3776).
 */
export function withoutLosingBuiltinVariants(
  node: { kind: string; tags: readonly string[] },
  rules: StyleRule[],
): StyleRule[] {
  const losing = losingVariantTags(node.kind, node.tags);
  if (losing.length === 0) return rules;
  return rules.filter(
    (rule) =>
      !NON_AUTHOR_SHEET_IDS.has(rule.sheetId) ||
      !rule.selector.tags.some((t) => losing.includes(t)),
  );
}
