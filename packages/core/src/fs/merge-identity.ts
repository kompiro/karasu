import type { KrsEdge, KrsFile, KrsNode } from "../types/ast.js";

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

/**
 * A copy of a block whose arrays and properties are its own, so reopening it
 * (pushing children, edges, scoped boundaries; reconciling `label` /
 * `description`) leaves the declaration it was copied from, and every cached
 * resolution holding that declaration, unchanged. The children are shared.
 */
export function copyForReopen<T extends KrsNode>(node: T): T {
  return {
    ...node,
    properties: { ...node.properties },
    children: [...node.children],
    edges: [...node.edges],
    ...(node.boundaries ? { boundaries: [...node.boundaries] } : {}),
  };
}

/**
 * The top-level list each root kind lives in. One enumeration, read by the
 * chain walk (which roots are candidates) and by materialization (where a
 * root lands), so a future top-level kind cannot reach one and miss the
 * other (TPL-1720).
 */
export function topLevelHomes(file: KrsFile): Map<string, KrsNode[]> {
  return new Map<string, KrsNode[]>([
    ["system", file.systems as KrsNode[]],
    ["service", file.services as KrsNode[]],
    ["client", file.clients as KrsNode[]],
    ["domain", file.domains as KrsNode[]],
    ["database", file.databases as KrsNode[]],
    ["queue", file.queues as KrsNode[]],
    ["storage", file.storages as KrsNode[]],
  ]);
}
