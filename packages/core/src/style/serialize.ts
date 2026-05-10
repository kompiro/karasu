import type { Trivia } from "../types/tokens.js";
import type { StyleRule, StyleSelector, StyleSheet } from "../types/style.js";

/**
 * Re-serialize a `StyleSheet` (with trivia) back to source text using
 * the canonical Tidy formatting:
 *
 *  - 2-space indent inside rules
 *  - `: ` after each property name
 *  - one blank line between rules (unless extra `blank-line` trivia
 *    requests more)
 *  - leading / trailing trivia preserved verbatim, glued to the
 *    construct they were attached to
 *  - rules that originated from one grouped selector list (`a, b { ... }`)
 *    are re-emitted in grouped form when their bodies remained identical
 *
 * The serializer is purely textual — it does not reorder declarations
 * or merge rules. Tidy passes are responsible for shaping the AST
 * before handing it here.
 */
export function serializeStyleSheet(sheet: StyleSheet): string {
  const groups = groupRulesByOrigin(sheet.rules);
  const out: string[] = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const head = group[0];
    const isFirstGroup = g === 0;

    // Leading trivia comes from the first rule of the group; siblings
    // were intentionally given empty trivia by the parser.
    out.push(formatLeadingTrivia(head.leadingTrivia ?? [], isFirstGroup));

    // Selector list — if the group has multiple rules, emit them
    // comma-separated in source order (their `sourceIndex`).
    const selectorText = group.map((r) => formatSelector(r.selector)).join(", ");
    out.push(selectorText);
    out.push(" {");

    const propertyNames = Object.keys(head.properties);
    if (propertyNames.length === 0) {
      out.push(" }");
    } else {
      out.push("\n");
      const declarationTrivia = head.declarationTrivia ?? {};
      for (let j = 0; j < propertyNames.length; j++) {
        const name = propertyNames[j];
        const trivia = declarationTrivia[name] ?? { leading: [], trailing: [] };
        out.push(formatDeclarationLeadingTrivia(trivia.leading));
        out.push(`  ${name}: ${head.properties[name]};`);
        const inlineTrailing = trivia.trailing.filter((t) => t.kind !== "blank-line");
        for (const t of inlineTrailing) {
          out.push(" ");
          out.push(t.text);
        }
        out.push("\n");
      }
      out.push("}");
    }

    // Trailing trivia on the same line as `}`.
    const tail = group[group.length - 1];
    for (const t of tail.trailingTrivia ?? []) {
      if (t.kind === "blank-line") continue;
      out.push(" ");
      out.push(t.text);
    }
    out.push("\n");
  }

  // Sheet-level trailing trivia (footer comments after the last rule).
  const trailing = (sheet.trailingTrivia ?? []).filter((t) => t.kind !== "blank-line");
  if (trailing.length > 0) {
    out.push("\n");
    for (const t of trailing) {
      out.push(t.text);
      out.push("\n");
    }
  }

  return out.join("");
}

export function formatSelector(selector: StyleSelector): string {
  if (selector.id) return `#${selector.id}`;
  let out = "";
  if (selector.nodeType) out += selector.nodeType;
  if (selector.edgeId) {
    out += `#${selector.edgeId}`;
  }
  for (const tag of selector.tags) {
    out += `[${tag}]`;
  }
  for (const annotation of selector.annotations) {
    out += `@${annotation}`;
  }
  return out;
}

/**
 * Render leading trivia for a rule (or rule group). Each comment is on
 * its own line. `blank-line` trivia inserts an additional blank line.
 *
 * Between two rules we always emit a single separator `\n` (so an empty
 * line appears between rules). Pass `isFirst=true` for the first rule
 * of the file to suppress that separator.
 */
function formatLeadingTrivia(trivia: Trivia[], isFirst: boolean): string {
  // Drop blank-line trivia that precedes any comment — it is redundant
  // with the inter-rule separator we always emit. Comment-then-blank
  // (which expresses an authored "header" pattern) is preserved.
  const trimmed = stripLeadingBlankLines(trivia);
  if (trimmed.length === 0) {
    return isFirst ? "" : "\n";
  }
  const parts: string[] = [];
  if (!isFirst) parts.push("\n");
  for (const t of trimmed) {
    if (t.kind === "blank-line") {
      parts.push("\n");
    } else {
      parts.push(t.text);
      parts.push("\n");
    }
  }
  return parts.join("");
}

function stripLeadingBlankLines(trivia: Trivia[]): Trivia[] {
  let i = 0;
  while (i < trivia.length && trivia[i].kind === "blank-line") i++;
  return trivia.slice(i);
}

/**
 * Render leading trivia for a declaration inside a rule body. Each
 * comment goes on its own line at 2-space indent.
 */
function formatDeclarationLeadingTrivia(trivia: Trivia[]): string {
  if (trivia.length === 0) return "";
  const parts: string[] = [];
  for (const t of trivia) {
    if (t.kind === "blank-line") {
      parts.push("\n");
    } else {
      parts.push("  ");
      parts.push(t.text);
      parts.push("\n");
    }
  }
  return parts.join("");
}

/**
 * Group rules that share an origin rule set (i.e., were emitted from a
 * single `selector1, selector2 { ... }`). The parser assigns the same
 * `loc` to each sibling and only the first one carries the body's
 * trivia; we use that signature plus a body-equality check to decide
 * whether siblings should re-emit as a grouped selector list.
 */
function groupRulesByOrigin(rules: StyleRule[]): StyleRule[][] {
  const groups: StyleRule[][] = [];
  let i = 0;
  while (i < rules.length) {
    const head = rules[i];
    const group: StyleRule[] = [head];
    let j = i + 1;
    while (j < rules.length && rulesShareOrigin(head, rules[j])) {
      group.push(rules[j]);
      j++;
    }
    groups.push(group);
    i = j;
  }
  return groups;
}

function rulesShareOrigin(a: StyleRule, b: StyleRule): boolean {
  if (a.loc.start.offset !== b.loc.start.offset || a.loc.end.offset !== b.loc.end.offset) {
    return false;
  }
  if (a.sheetId !== b.sheetId) return false;
  // Body must still be identical — Tidy passes that mutate one sibling
  // (e.g. property reorder) keep all siblings in sync because they
  // share the same `properties` map snapshot. If a divergence happens
  // we fall back to emitting separately.
  if (!shallowEqualRecord(a.properties, b.properties)) return false;
  return true;
}

function shallowEqualRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
