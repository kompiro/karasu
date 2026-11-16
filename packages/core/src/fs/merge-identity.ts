import type { KrsEdge, KrsFile } from "../types/ast.js";

/**
 * Whether two edges are the same edge for the cross-file union.
 *
 * The identity is the one `docs/spec/syntax.md` § multi-file import semantics
 * states — "Exact duplicates (same `from`, `to`, kind, label) are
 * deduplicated; otherwise both are kept". `kind` is load-bearing: dropping it
 * fuses `a -> b` and `a --> b` into whichever entry merged first, which is the
 * sync/async distinction disappearing rather than a duplicate being removed.
 *
 * Every edge merge goes through here (#2780). The system reopen, the infra
 * body union and the named-import merge each once spelled the comparison
 * inline, and they had drifted to three different identities — the shape
 * TPL-1385 warns about, where a merge enumerating fields disagrees with the
 * spec once a field is left out.
 */
export function isSameEdge(a: KrsEdge, b: KrsEdge): boolean {
  return a.from === b.from && a.to === b.to && a.kind === b.kind && a.label === b.label;
}

/** Appends a resolved style path unless the merged model already holds it. */
export function addStyleImport(mergedFile: KrsFile, styleImport: string): void {
  if (!mergedFile.styleImports.includes(styleImport)) mergedFile.styleImports.push(styleImport);
}
