// Keyword tables the parser dispatches on, exported for the tools that must
// agree with it (formatter, Reference catalog fence, docs fence guard). Pure
// data: this module imports nothing, so any of them can read it without
// pulling in the parser.

/**
 * The block keywords the parser accepts as logical node declarations.
 *
 * Exported so the hand-maintained Reference catalog can be fenced against the
 * parser instead of against a doc table generated from that same catalog —
 * see `builtins/reference-parser-sync.test.ts` (#2158, TPL-2158).
 */
export const LOGICAL_KEYWORDS = new Set<string>([
  "system",
  "service",
  "domain",
  "usecase",
  "entity",
  "resource",
  "user",
  "client",
  "database",
  "queue",
  "storage",
]);

/**
 * How a recognized parameter value is spelled, which decides how the formatter
 * quotes it on the way back out (#2571).
 *
 * - `"string"`: an opaque, display-only value (`until` / `confidence`). Kept
 *   verbatim per ADR-1568 / ADR-1995, so it emits quoted like any string value.
 * - `"ref"`: a node reference (`from`). It emits through `quoteId`, the rule
 *   every other reference in the language follows.
 */
export type AnnotationParamKind = "string" | "ref";

/**
 * Recognized parameter keys per builtin lifecycle annotation (#1568). A param
 * on any other annotation, or with another key, is dropped with an
 * `annotation-param-unsupported` warning. Custom annotations stay param-less.
 *
 * Exported for the same reason as `DEPLOY_KEYWORDS`: the formatter has to emit
 * these params back (#2571) and needs each value's kind to quote it. A
 * hand-copied table there would silently stop matching whichever key was added
 * last (TPL-1720), and the formatter dropping a param is exactly the
 * round-trip break TPL-1101 forbids.
 */
export const ANNOTATION_PARAM_KEYS = {
  deprecated: { until: "string" },
  experimental: { until: "string" },
  migration_target: { from: "ref" },
  draft: { confidence: "string" },
} as const satisfies Record<string, Record<string, AnnotationParamKind>>;

/**
 * The kind recorded for one annotation parameter, or `undefined` when the
 * parser does not recognize the pair.
 *
 * The single reader of `ANNOTATION_PARAM_KEYS`. The parser asks it whether a
 * key has an effect and the formatter asks it how to quote the value; letting
 * each index the table itself would put the lookup rule in two places, which
 * is the drift the table is exported to avoid. `Object.hasOwn` keeps a
 * prototype-named annotation (`__proto__`, `constructor`) from resolving
 * through `Object.prototype` and reporting inherited members as recognized.
 */
export function annotationParamKind(
  annotation: string,
  key: string,
): AnnotationParamKind | undefined {
  const table: Record<string, Record<string, AnnotationParamKind>> = ANNOTATION_PARAM_KEYS;
  if (!Object.hasOwn(table, annotation)) return undefined;
  const keys = table[annotation];
  return Object.hasOwn(keys, key) ? keys[key] : undefined;
}

/**
 * The block keywords the parser accepts as deploy-unit declarations.
 *
 * Exported for the same reason as `LOGICAL_KEYWORDS`: the docs fence guard
 * (`scripts/lint/krs-fences.ts`) recognizes a bare ``` fence as `.krs` by its
 * declaration lines, and a hand-copied subset there would silently stop
 * recognizing whichever kind was added last (TPL-1720).
 */
export const DEPLOY_KEYWORDS = new Set<string>([
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "store",
]);
