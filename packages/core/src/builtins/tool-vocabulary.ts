import type { StyleSelector } from "../types/style.js";
import { REFERENCE_DATA } from "./reference-data.js";

/**
 * The tool vocabulary: the tag and annotation names karasu owns.
 *
 * `.krs language v2.0` closes both registers to this set (ADR-2065 decision 4,
 * #2677). A name outside it still parses and is warned about
 * (`tag-not-builtin` / `annotation-not-builtin`), but it has no effect — and a
 * `.krs.style` rule that targets it matches nothing ({@link
 * selectorUsesToolVocabularyOnly}).
 */

/**
 * Tags outside the builtin table that are still legitimate: the
 * system-assigned tags of docs/spec/tags-annotations.md § System-assigned
 * tags. Most are synthesized after parsing and never appear in `.krs` files,
 * but `[inferred]` is stamped *into* the emitted source by
 * `translate --from db` and persists until curated away — warning on these
 * would flag the tool's own vocabulary as foreign.
 *
 * Every tag the tool stamps on an element has to be listed here or in the
 * builtin table, or the builtin theme's own rule for it stops matching once
 * arbitrary-name selectors are disabled. `delivers` is the edge
 * `view-extract.ts` derives from a service's `delivers` property.
 */
export const SYSTEM_ASSIGNED_TAGS: readonly string[] = [
  "implicit",
  "cyclic",
  "read",
  "write",
  "inferred",
  "projected",
  "delivers",
];

/** Every tag name in the tool vocabulary: the builtin table plus the system-assigned tags. */
export const TOOL_TAGS: ReadonlySet<string> = new Set<string>([
  ...REFERENCE_DATA.tags.map((t) => t.name),
  ...SYSTEM_ASSIGNED_TAGS,
]);

/** Every annotation name in the tool vocabulary (the builtin lifecycle table). */
export const TOOL_ANNOTATIONS: ReadonlySet<string> = new Set<string>(
  REFERENCE_DATA.annotations.map((a) => a.name),
);

/**
 * Whether every tag and annotation a selector names is in the tool vocabulary.
 *
 * A rule whose selector fails this matches nothing, as a whole. Ignoring only
 * the foreign term would widen the rule instead: `service[pci]` would paint
 * every service.
 */
export function selectorUsesToolVocabularyOnly(selector: StyleSelector): boolean {
  return (
    selector.tags.every((t) => TOOL_TAGS.has(t)) &&
    selector.annotations.every((a) => TOOL_ANNOTATIONS.has(a))
  );
}

/**
 * The builtin annotation name a non-builtin `name` is a near-miss of, or
 * undefined when none is close enough.
 *
 * This is part of the language definition (`.krs language v2.0`, #2677): a
 * near-miss is rejected as `annotation-possible-typo` (an error), while any
 * other non-builtin name only warns (`annotation-not-builtin`). The writer of
 * `@depracated` meant the builtin and would silently lose its badge; the writer
 * of `@team_alpha` wrote an unknown word.
 *
 * The budget scales with the builtin's length: 1 edit for names of 4
 * characters or fewer (`new`), 2 otherwise. The nearest builtin wins. Distance
 * is optimal-string-alignment (Levenshtein plus adjacent transposition), so the
 * classic slip `@nwe` sits 1 edit from `new`.
 */
export function nearestToolAnnotation(name: string): string | undefined {
  if (TOOL_ANNOTATIONS.has(name)) return undefined;
  let best: { builtin: string; distance: number } | undefined;
  for (const builtin of TOOL_ANNOTATIONS) {
    const budget = builtin.length <= 4 ? 1 : 2;
    const distance = osaDistance(name, builtin);
    if (distance <= budget && (best === undefined || distance < best.distance)) {
      best = { builtin, distance };
    }
  }
  return best?.builtin;
}

function osaDistance(a: string, b: string): number {
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}
