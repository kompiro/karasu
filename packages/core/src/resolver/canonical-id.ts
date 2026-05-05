import type { Diagnostic, KrsEdge } from "../types/ast.js";

/**
 * Compute the base portion of an edge's canonical ID — `<from><arrow><to>`
 * where arrow is `->` for sync edges and `-->` for async. This is the
 * fallback canonical ID used when no `authorId` is set.
 */
export function edgeBaseId(edge: KrsEdge): string {
  const arrow = edge.kind === "async" ? "-->" : "->";
  return `${edge.from}${arrow}${edge.to}`;
}

/**
 * Assign `canonicalId` to each edge in place and return any diagnostics
 * raised during disambiguation.
 *
 * Rules (see `docs/design/edge-id-selector.md`):
 *  - If `authorId` is set, it becomes `canonicalId`.
 *  - Otherwise the base `<from><arrow><to>` is used.
 *  - Duplicate `authorId` across edges → `duplicate-edge-id` error on each
 *    duplicate; their `canonicalId` is cleared so the `edge#<id>` selector
 *    matches none of them.
 *  - Multiple edges sharing the same computed base with no `authorId` →
 *    `ambiguous-edge-base` warning on each; their `canonicalId` is cleared.
 *  - An authored ID that happens to collide with a computed base on a
 *    different edge is reported as `duplicate-edge-id` and both lose their
 *    `canonicalId`.
 *
 * Edges are mutated in place; callers receive the diagnostics list to merge
 * with their own collection.
 */
export function assignEdgeCanonicalIds(edges: readonly KrsEdge[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const edge of edges) {
    edge.canonicalId = edge.authorId ?? edgeBaseId(edge);
  }

  const groups = new Map<string, KrsEdge[]>();
  for (const edge of edges) {
    const id = edge.canonicalId;
    if (id === undefined) continue;
    const bucket = groups.get(id);
    if (bucket) {
      bucket.push(edge);
    } else {
      groups.set(id, [edge]);
    }
  }

  for (const [id, group] of groups) {
    if (group.length < 2) continue;

    const anyAuthored = group.some((e) => e.authorId !== undefined);
    if (anyAuthored) {
      for (const edge of group) {
        diagnostics.push({
          severity: "error",
          code: "duplicate-edge-id",
          params: { authorId: id },
          ...(edge.loc ? { loc: edge.loc } : {}),
        });
      }
    } else {
      const sample = group[0];
      const arrow: "->" | "-->" = sample.kind === "async" ? "-->" : "->";
      for (const edge of group) {
        diagnostics.push({
          severity: "warning",
          code: "ambiguous-edge-base",
          params: { fromId: edge.from, toId: edge.to, arrow },
          ...(edge.loc ? { loc: edge.loc } : {}),
        });
      }
    }

    for (const edge of group) {
      edge.canonicalId = undefined;
    }
  }

  return diagnostics;
}
