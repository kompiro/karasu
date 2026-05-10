import type { Diagnostic } from "../types/ast.js";
import type { DeclarationTrivia, StyleRule, StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";
import { axisOfProperty, AXIS_ORDER } from "./property-axes.js";
import { formatSelector, serializeStyleSheet } from "./serialize.js";

/**
 * Options controlling the Tidy passes.
 */
export interface TidyOptions {
  /**
   * When `false`, skip the duplicate-rule merge pass. Default: true.
   * The CLI exposes this as `--no-merge`.
   */
  merge?: boolean;
}

/**
 * Result of a Tidy run.
 */
export interface TidyResult {
  /** Re-serialized source after applying the Tidy passes. */
  output: string;
  /** True when `output` differs from the input — the file would change. */
  changed: boolean;
  /** Diagnostics emitted by the parser while reading the input. */
  diagnostics: Diagnostic[];
}

/**
 * Run the Tidy passes on a `.krs.style` source string and return the
 * normalized output.
 *
 * Passes (in order):
 *   1. Merge duplicate rules with the same selector (cascade-tail wins).
 *   2. Reorder declarations within each rule by axis group
 *      (visual → typography → layout → karasu); declaration order
 *      within an axis is preserved.
 *   3. Serialize back to text using the canonical formatting.
 *
 * Tidy is designed to be idempotent: `tidy(tidy(x)) === tidy(x)`.
 */
export function tidyStyleSheet(input: string, options: TidyOptions = {}): TidyResult {
  const merge = options.merge ?? true;
  const parsed = StyleParser.parse(input);
  let sheet: StyleSheet = parsed.value;

  if (merge) {
    sheet = mergeDuplicateRules(sheet);
  }
  sheet = reorderProperties(sheet);

  const output = serializeStyleSheet(sheet);
  return {
    output,
    changed: output !== input,
    diagnostics: parsed.diagnostics,
  };
}

/**
 * Collapse rules that share the same canonical selector signature into a
 * single rule. Properties merge with cascade-tail wins (later overrides
 * earlier). Leading-trivia from each absorbed rule concatenates onto the
 * survivor in original source order; declaration trivia of properties
 * present in both keeps the first occurrence's `leading` and accumulates
 * `trailing` from later occurrences.
 */
function mergeDuplicateRules(sheet: StyleSheet): StyleSheet {
  const seen = new Map<string, number>(); // signature → index in `merged`
  const merged: StyleRule[] = [];

  for (const rule of sheet.rules) {
    const sig = selectorSignature(rule);
    const existingIdx = seen.get(sig);

    if (existingIdx === undefined) {
      seen.set(sig, merged.length);
      merged.push({ ...rule, properties: { ...rule.properties } });
      continue;
    }

    const target = merged[existingIdx];
    const combined = absorbRule(target, rule);
    merged[existingIdx] = combined;
  }

  return { ...sheet, rules: merged };
}

function selectorSignature(rule: StyleRule): string {
  // Use the formatted selector string as a stable signature — it's
  // exactly the source we'd compare visually.
  return formatSelector(rule.selector);
}

function absorbRule(into: StyleRule, from: StyleRule): StyleRule {
  // Merge properties: cascade-tail wins. We rebuild the order as the
  // union of `into`'s order then any new keys from `from`, with values
  // from `from` overriding when both have the same key.
  const properties: Record<string, string> = { ...into.properties };
  for (const key of Object.keys(from.properties)) {
    properties[key] = from.properties[key];
  }

  // Combine declaration trivia. For each property:
  //   - leading: keep `into`'s if present, otherwise take `from`'s
  //   - trailing: concatenate `into.trailing` then `from.trailing`
  const intoTrivia = into.declarationTrivia ?? {};
  const fromTrivia = from.declarationTrivia ?? {};
  const declarationTrivia: Record<string, DeclarationTrivia> = {};
  for (const key of Object.keys(properties)) {
    const a = intoTrivia[key];
    const b = fromTrivia[key];
    if (a && b) {
      declarationTrivia[key] = {
        leading: a.leading.length > 0 ? a.leading : b.leading,
        trailing: [...a.trailing, ...b.trailing],
      };
    } else if (a) {
      declarationTrivia[key] = a;
    } else if (b) {
      declarationTrivia[key] = b;
    }
  }

  // Concatenate leading trivia in source order.
  const leadingTrivia = [...(into.leadingTrivia ?? []), ...(from.leadingTrivia ?? [])];

  // Trailing trivia: keep `from`'s (the surviving rule logically ends
  // where the last absorbed sibling ended).
  const trailingTrivia = from.trailingTrivia ?? into.trailingTrivia ?? [];

  return {
    ...into,
    properties,
    declarationTrivia,
    leadingTrivia,
    trailingTrivia,
  };
}

/**
 * Reorder declarations within each rule by axis group. Properties whose
 * axes match keep their relative source order; the four axes appear in
 * the order declared by `AXIS_ORDER`.
 */
function reorderProperties(sheet: StyleSheet): StyleSheet {
  return {
    ...sheet,
    rules: sheet.rules.map((rule) => {
      const sortedProperties: Record<string, string> = {};
      const sortedTrivia: Record<string, DeclarationTrivia> = {};
      const declTrivia = rule.declarationTrivia ?? {};

      const orderedKeys = orderPropertyKeys(Object.keys(rule.properties));
      for (const key of orderedKeys) {
        sortedProperties[key] = rule.properties[key];
        if (declTrivia[key]) sortedTrivia[key] = declTrivia[key];
      }

      return {
        ...rule,
        properties: sortedProperties,
        declarationTrivia: sortedTrivia,
      };
    }),
  };
}

function orderPropertyKeys(keys: string[]): string[] {
  // Stable partition by axis: properties keep their original relative
  // order within an axis; axes themselves appear in `AXIS_ORDER`.
  const buckets = new Map<string, string[]>();
  for (const axis of AXIS_ORDER) buckets.set(axis, []);
  for (const key of keys) {
    buckets.get(axisOfProperty(key))!.push(key);
  }
  const out: string[] = [];
  for (const axis of AXIS_ORDER) {
    out.push(...buckets.get(axis)!);
  }
  return out;
}
