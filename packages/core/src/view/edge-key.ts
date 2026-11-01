import type { KrsEdge } from "../types/ast.js";
import { quotedIdLiteral } from "../formatter/quote-id.js";

/**
 * Identity of an edge by its endpoint pair: the key every diff map is written
 * under and every renderer reads back (`edge-layer.ts`, `group-collapse.ts`,
 * the root view's per-frame lookup in `layout-multi-system.ts`, the deploy
 * ghost-edge diff), the key every view-extract dedup and suppression set
 * compares on, and the parallel-bundle grouping in `edge-routing-bundles.ts`.
 * Build it here and nowhere else, so the writers and readers cannot drift
 * apart (TPL-1352).
 *
 * A plain `${from}->${to}` join is not injective: a quoted id may contain
 * `->`, so `a -> "b->c"` and `"a->b" -> c` both joined to `a->b->c` and the
 * two edges shared one diff state (#2819), one aggregated implicit edge and
 * one suppression entry (#3111). An endpoint that would make the join
 * ambiguous (it carries the `->` separator, or the `"` / `\` the quoted form
 * is built from) is therefore wrapped in the `.krs` string-literal form, the
 * same rule `nodePathRefId` applies to path segments (ADR-2714). The key then
 * splits one way only: a bare `from` has no `->` in it and cannot end the
 * separator early (`->` does not overlap itself), and a quoted `from` ends at
 * its closing quote. Every other edge keeps the `${from}->${to}` it always had.
 */
export function edgeKey(edge: Pick<KrsEdge, "from" | "to">): string {
  return `${quoteEdgeEndpoint(edge.from)}->${quoteEdgeEndpoint(edge.to)}`;
}

/**
 * Identity of an edge by its endpoint pair **and** arrow kind, so a sync and an
 * async edge between one pair stay two entries. Injective because
 * {@link edgeKey} is and the kind (`sync` / `async`) carries no `#`: the key
 * splits at its last `#`. An ordinary edge keys `${from}->${to}#${kind}`.
 */
export function edgeKindKey(edge: Pick<KrsEdge, "from" | "to" | "kind">): string {
  return `${edgeKey(edge)}#${edge.kind}`;
}

function quoteEdgeEndpoint(endpoint: string): string {
  return endpoint.includes("->") || /["\\]/.test(endpoint) ? quotedIdLiteral(endpoint) : endpoint;
}
