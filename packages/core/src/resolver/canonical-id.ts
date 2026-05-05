import type { Diagnostic, KrsEdge, KrsFile, KrsNode } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";

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
 *  - Multiple edges sharing the same computed base with no `authorId` →
 *    `ambiguous-edge-base` warning on each; their `canonicalId` is
 *    cleared so the `edge#<base>` selector matches none of them.
 *  - When two edges share an authored id (or an authored id collides
 *    with another edge's computed base), `canonicalId` is silently
 *    cleared — the corresponding `duplicate-edge-id` error is raised
 *    project-wide by `validateProjectEdgeIdUniqueness`, so emitting the
 *    same diagnostic again here would just double up.
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

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const anyAuthored = group.some((e) => e.authorId !== undefined);
    if (!anyAuthored) {
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

interface AuthorIdSite {
  authorId: string;
  loc: SourceRange | undefined;
}

function collectAuthorIdSites(node: KrsNode, sink: AuthorIdSite[]): void {
  if (node.kind === "resource" && node.authorId !== undefined) {
    sink.push({ authorId: node.authorId, loc: node.loc });
  }
  for (const edge of node.edges) {
    if (edge.authorId !== undefined) {
      sink.push({ authorId: edge.authorId, loc: edge.loc });
    }
  }
  for (const child of node.children) {
    collectAuthorIdSites(child, sink);
  }
}

/**
 * Project-wide check that every author-supplied edge id (from `from -> to
 * #<id>` declarations and from `usecase` `resource <ref> #<id>` rows) is
 * unique across the whole `KrsFile`. Runs at parse time, before view
 * extraction, so collisions surface even when the colliding edges live in
 * disjoint views (e.g. an explicit edge in a system block and a
 * synthesized usecase->resource edge that only appears under a usecase
 * drilldown).
 *
 * `assignEdgeCanonicalIds` still runs per view to handle base-form
 * disambiguation among edges that share endpoints; this pass is the
 * higher-level guarantee that the design doc promises.
 */
export function validateProjectEdgeIdUniqueness(krsFile: KrsFile): Diagnostic[] {
  const sites: AuthorIdSite[] = [];
  for (const system of krsFile.systems) {
    collectAuthorIdSites(system, sites);
  }

  const groups = new Map<string, AuthorIdSite[]>();
  for (const site of sites) {
    const bucket = groups.get(site.authorId);
    if (bucket) {
      bucket.push(site);
    } else {
      groups.set(site.authorId, [site]);
    }
  }

  const diagnostics: Diagnostic[] = [];
  for (const [authorId, group] of groups) {
    if (group.length < 2) continue;
    for (const site of group) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-edge-id",
        params: { authorId },
        ...(site.loc ? { loc: site.loc } : {}),
      });
    }
  }
  return diagnostics;
}
