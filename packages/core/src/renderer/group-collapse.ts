import type { KrsNode, KrsEdge } from "../types/ast.js";
import { makeStubNode } from "./collapse-stub.js";

/**
 * Per-group collapse for the system-view "Group by: team" mode (Issue #1858,
 * P2a slice B). A collapsed *group* folds to a `<Team> (N)` stub **and
 * re-targets** every edge that crossed the group boundary onto the stub — so
 * collapsing all groups yields the readable group-dependency-DAG view
 * (design § "計測 5"), not a set of disconnected boxes. Category collapse
 * (`category-collapse.ts` `collapseCategories`, #1821) now uses the same
 * re-target strategy for the external/infra tiers (#1872).
 *
 * Structural over `ownerIndex` (node id → group), so it works before layout.
 */

/** Marker tag on a synthesized group-collapse stub. */
export const GROUP_STUB_TAG = "__group_stub__";

/**
 * Stable id of the stub that stands in for a collapsed group. `scope` (the
 * enclosing system id, in the multi-system root view) namespaces the id so a
 * team owning members in several systems yields a distinct stub per system
 * instead of colliding on one id (#1884). Omitted in the single-system view.
 */
export function groupStubId(groupId: string, scope?: string): string {
  return scope !== undefined
    ? `__group_collapsed_${scope}_${groupId}__`
    : `__group_collapsed_${groupId}__`;
}

function stubNode(groupId: string, count: number, scope?: string): KrsNode {
  return makeStubNode({
    id: groupStubId(groupId, scope),
    kind: "service",
    label: `${groupId} (${count})`,
    tags: [GROUP_STUB_TAG],
  });
}

interface GroupCollapseResult {
  nodes: KrsNode[];
  edges: KrsEdge[];
  /** Stub id → the group it stands in for (so the caller can band/frame it). */
  stubGroup: Map<string, string>;
  /**
   * The endpoint remap this collapse applied to `edges` (member id → its group
   * stub id; identity for everything else). Exposed so callers can re-anchor
   * *other* id lists that reference the same members — e.g. the ghost-edge lists
   * on the ViewSlice that `collapseGroups` does not itself rewrite (#1874).
   * Identity when nothing collapsed.
   */
  remapEndpoint: (id: string) => string;
  /**
   * Diff state re-keyed onto the re-targeted stub edges, keyed by the render
   * lookup form `${from}->${to}` (kind-less, matching `svg-renderer.ts`). A stub
   * edge aggregates one-or-more original cross-group edges; its state is the
   * single original state when unambiguous, else `changed` (#1886, decision 2).
   * Only populated when a diff-state map is supplied AND something collapses;
   * only carries non-`unchanged` entries (an all-unchanged fold is left
   * undecorated, matching the pre-collapse render). Empty otherwise.
   */
  foldedEdgeDiffState: Map<string, string>;
}

/**
 * Fold the diff states of the original edges that collapse onto one stub edge.
 * A single distinct state carries through; a mix reports `changed` — an existing
 * `DiffState` value (see `view-diff.ts`). Order-independent and deterministic.
 */
function foldEdgeDiffStates(states: readonly string[]): string {
  const distinct = new Set(states);
  return distinct.size === 1 ? [...distinct][0] : "changed";
}

/**
 * Replace each collapsed group's member nodes with one stub, and re-target the
 * edges: an endpoint owned by a collapsed group becomes that group's stub;
 * edges that fall entirely inside one collapsed group are dropped, and the rest
 * are de-duplicated per `(from, to, kind)`. Returns the input unchanged when
 * nothing collapses.
 */
export function collapseGroups(
  nodes: readonly KrsNode[],
  edges: readonly KrsEdge[],
  ownerIndex: Map<string, string>,
  collapsed: ReadonlySet<string> | undefined,
  edgeDiffState?: ReadonlyMap<string, string>,
  /**
   * Namespaces the synthesized stub ids (the enclosing system id in the
   * multi-system root view) so a team spanning systems gets one stub per system
   * rather than a single colliding id (#1884). Omitted in the single-system view.
   */
  stubScope?: string,
): GroupCollapseResult {
  const stubGroup = new Map<string, string>();
  if (!collapsed || collapsed.size === 0) {
    return {
      nodes: nodes as KrsNode[],
      edges: edges as KrsEdge[],
      stubGroup,
      remapEndpoint: (id) => id,
      foldedEdgeDiffState: new Map(),
    };
  }

  const collapsedGroupOf = (id: string): string | null => {
    const g = ownerIndex.get(id);
    return g !== undefined && collapsed.has(g) ? g : null;
  };

  const kept: KrsNode[] = [];
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const g = collapsedGroupOf(node.id);
    if (g !== null) counts.set(g, (counts.get(g) ?? 0) + 1);
    else kept.push(node);
  }
  for (const [groupId, count] of counts) {
    // `counts` only ever holds ids seen at least once, so count >= 1 always.
    kept.push(stubNode(groupId, count, stubScope));
    stubGroup.set(groupStubId(groupId, stubScope), groupId);
  }

  const remap = (id: string): string => {
    const g = collapsedGroupOf(id);
    return g !== null ? groupStubId(g, stubScope) : id;
  };
  const outEdges: KrsEdge[] = [];
  const seen = new Set<string>();
  // Accumulate the original diff states that fold onto each stub edge, keyed by
  // the render lookup form `${from}->${to}` (kind-less — the render diff lookup
  // in `svg-renderer.ts` and the `diffed.edges` key both drop `#kind`, so a
  // sync+async stub-edge pair shares one slot and folds together). #1886.
  const foldAccum = new Map<string, string[]>();
  for (const edge of edges) {
    const from = remap(edge.from);
    const to = remap(edge.to);
    if (from === edge.from && to === edge.to) {
      // Neither endpoint was collapsed: pass through untouched so authored
      // parallel edges (same from/to/kind, different labels) between two
      // expanded nodes all survive, and a pre-existing self-loop is kept.
      outEdges.push(edge);
      continue;
    }
    if (from === to) continue; // both endpoints folded into the same stub
    if (edgeDiffState) {
      // Re-key this re-targeted edge's diff state onto the stub edge (decoration
      // keyed on the pre-collapse endpoints would otherwise miss the stub id and
      // render undecorated - TPL-20260712-01). `unchanged` default so a collapse
      // in non-diff mode (no diff map entries) contributes nothing.
      const renderKey = `${from}->${to}`;
      const origState = edgeDiffState.get(`${edge.from}->${edge.to}`) ?? "unchanged";
      const bucket = foldAccum.get(renderKey);
      if (bucket) bucket.push(origState);
      else foldAccum.set(renderKey, [origState]);
    }
    const key = `${from} ${to} ${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A re-targeted edge stands for one-or-more real edges, so its authored
    // label no longer describes it — drop the label but keep the sync/async kind.
    outEdges.push({ ...edge, from, to, label: undefined });
  }

  const foldedEdgeDiffState = new Map<string, string>();
  for (const [renderKey, states] of foldAccum) {
    const folded = foldEdgeDiffStates(states);
    // Leave an all-`unchanged` fold undecorated (matches the pre-collapse edge,
    // which carried no diff state); only surface real change on the stub edge.
    if (folded !== "unchanged") foldedEdgeDiffState.set(renderKey, folded);
  }

  return { nodes: kept, edges: outEdges, stubGroup, remapEndpoint: remap, foldedEdgeDiffState };
}
