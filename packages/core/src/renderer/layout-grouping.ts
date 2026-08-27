/**
 * Grouping-axis resolution and group collapse for the layout pipelines
 * (#2512): the per-canvas membership axis (#2036/#2176), the placement
 * axis / group index derivation, and the shared collapse + banded-layer
 * machinery both pipelines call (TPL-219).
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { boundaryScopeKey, scopedBoundaryGroupId } from "../types/ast.js";
import { nodePathKey } from "../parser/node-path.js";
import { collapseGroups } from "./group-collapse.js";
import {
  assignGroupedLayers,
  groupOrderFor,
  resolvePlacementAxis,
  type GroupedNode,
  type GroupBand,
} from "./group-layout.js";
import { systemTier } from "./layer-assignment.js";
import type { LayoutOptions } from "./layout-types.js";

/** Grouped-layer computation shared by {@link collapseAndAssignGroupLayers}. */
interface GroupedLayerBands {
  layers: Map<string, number>;
  groupBands: Map<string, GroupBand>;
  groupOrder: string[];
}

/**
 * Project a path-keyed model index (#2548: `ownerIndex`,
 * `boundaryMembership`) onto one canvas: the entry for full path
 * `[...scopePath, nid]` becomes an entry for `nid`, and entries under other
 * scopes or deeper levels drop out. This is where the path-keyed indices
 * meet the canvas machinery, which keys everything by the node ids present
 * on the canvas being drawn.
 */
function projectPathIndexOntoCanvas<V>(
  index: ReadonlyMap<string, V>,
  scopePath: readonly string[],
): Map<string, V> {
  const prefix = scopePath.length > 0 ? `${nodePathKey(scopePath)}.` : "";
  const out = new Map<string, V>();
  for (const [pathKey, value] of index) {
    if (!pathKey.startsWith(prefix)) continue;
    const nid = pathKey.slice(prefix.length);
    if (nid.length === 0 || nid.includes(".")) continue;
    out.set(nid, value);
  }
  return out;
}

/**
 * The boundary membership that applies to the canvas being drawn (#2036).
 *
 * `boundaryMembership` names nodes by full path (#2548), so its reach is
 * model-wide and each canvas projects out the entries that sit on it (a bare
 * `contains X` expands to every `X` at build time, which is what used to make
 * the bare-id map "apply everywhere"); a scoped block is declared on one
 * canvas and applies only there. Where both name the same node the scoped
 * entry wins — it is the more specific statement, written next to the node
 * it names — and the top-level form keeps its reach untouched everywhere
 * else.
 *
 * Scoped entries carry a scope-qualified group id (`scopedBoundaryGroupId`):
 * a scoped boundary's identity is (declaring scope, id), so a same-named
 * boundary in another scope is a different group — separate frame container
 * id, independent collapse state. Top-level ids stay bare, keeping today's
 * one-declaration / collapse-everywhere behavior (#1884 precedent).
 *
 * `scopePath` is the chain of node ids from the root down to this canvas's
 * container, which is what the parser keys membership by.
 */
function boundaryAxisFor(
  scopePath: readonly string[],
  boundaryMembership: Map<string, string[]> | undefined,
  scopedBoundaryMembership: Map<string, Map<string, string[]>> | undefined,
): Map<string, string[]> | undefined {
  const canvasLevel =
    boundaryMembership !== undefined
      ? projectPathIndexOntoCanvas(boundaryMembership, scopePath)
      : undefined;
  const scoped = scopedBoundaryMembership?.get(boundaryScopeKey(scopePath));
  if (scoped === undefined || scoped.size === 0) return canvasLevel;
  const qualified = new Map<string, string[]>();
  for (const [nodeId, boundaryIds] of scoped) {
    qualified.set(
      nodeId,
      boundaryIds.map((boundaryId) => scopedBoundaryGroupId(scopePath, boundaryId)),
    );
  }
  if (canvasLevel === undefined) return qualified;
  // Scoped *replaces* the node's membership on this canvas rather than adding
  // to it: it restates where the node sits here, and the top-level declaration
  // keeps its reach on every other canvas (ADR-2036). 1:N does not turn that
  // into a union — the two are different statements, not two halves of one.
  return new Map([...canvasLevel, ...qualified]);
}

/**
 * The nodes a band-less boundary may claim on this canvas (#2176).
 *
 * The diff restores a `removed` node's whole before-side membership so it
 * returns to its former frame (ADR-1886). Returning it is *all* those entries
 * are for. Let them reach the #2176 machinery and a node the model no longer
 * has starts placing the ones it does: handing a band-less boundary a body,
 * pulling two live bands next to each other, or biasing a seam row — each of
 * them a frame or an order the equivalent after-only render never shows.
 *
 * So a removed node is cut back to its primary, which is the entry that returns
 * it. It keeps its frame; it stops deciding anyone else's.
 *
 * Reducing the *membership* rather than filtering the node set matters: the
 * node stays present for `resolvePlacementAxis`'s "does this group already hold
 * a member" count, which is exactly what a removed node still does inside its
 * former frame. Filtering it out of that count instead makes its group look
 * empty and lets a band-less boundary raid a group that was never at risk.
 *
 * Identity when nothing is removed — every non-diff render.
 */
function placementMembership(
  membership: Map<string, string[]> | undefined,
  nodeDiffState: ReadonlyMap<string, string> | undefined,
): Map<string, string[]> | undefined {
  if (membership === undefined || nodeDiffState === undefined) return membership;
  let reduced: Map<string, string[]> | undefined;
  for (const [nodeId, groupIds] of membership) {
    if (groupIds.length < 2 || nodeDiffState.get(nodeId) !== "removed") continue;
    reduced ??= new Map(membership);
    reduced.set(nodeId, [groupIds[0]]);
  }
  return reduced ?? membership;
}

/*
 * The 1:1 axis a banded layout places by — the single point where 1:N
 * membership meets the view's one-band-per-node requirement (TPL-2161) — now
 * lives in `resolvePlacementAxis` (group-layout.ts), which starts from the same
 * primary and only departs from it to give a bandless boundary a body (#2176).
 * Everything downstream — `collapseGroups`, the band assignment, the frames —
 * keeps taking a plain `Map<nodeId, groupId>`.
 */

/**
 * The membership axis for one canvas: the boundary membership that applies to
 * this scope (#2036), cut back for removed diff nodes (#2176 / ADR-1886);
 * `undefined` off the boundary axis. Shared by the single-system canvas
 * (ancestors + focused container as the scope path) and the multi-system root
 * (each system frame is its own canvas, scope path `[systemId]`), so the two
 * paths cannot drift on how a scope resolves its membership (TPL-219).
 */
export function canvasMembershipFor(
  scopePath: readonly string[],
  options: LayoutOptions,
): Map<string, string[]> | undefined {
  const { groupBy, boundaryMembership, scopedBoundaryMembership, nodeDiffState } = options;
  return placementMembership(
    groupBy === "boundary"
      ? boundaryAxisFor(scopePath, boundaryMembership, scopedBoundaryMembership)
      : undefined,
    nodeDiffState,
  );
}

/**
 * The placement axis and grouping index for one canvas (#2176, TPL-2161):
 * resolve the placement axis from the canvas membership (boundary axis), or
 * fall back to the owner index when grouping by team. An empty axis is
 * normalized to `undefined` so both pipelines gate identically on
 * `groupBy && groupIndex`: entering the collapse machinery with an empty
 * index was always a no-op (`collapseGroups` folds nothing and the band
 * assignment's own `size > 0` guard blocks), so the multi path's historical
 * extra `size > 0` gate encoded no live behavior — normalizing here closes
 * that drift seam (TPL-219). `bandOrder` carries the `declaredGroupOrder`
 * fallback so the two call sites cannot drift on it either.
 */
export function resolveCanvasAxis(
  membership: Map<string, string[]> | undefined,
  presentIds: ReadonlySet<string>,
  options: LayoutOptions,
  scopePath: readonly string[],
): {
  bandOrder: readonly string[] | undefined;
  groupIndex: Map<string, string> | undefined;
} {
  const { declaredGroupOrder, groupBy, ownerIndex } = options;
  const placement =
    membership !== undefined
      ? resolvePlacementAxis(membership, declaredGroupOrder, presentIds)
      : undefined;
  // The team axis projects the path-keyed ownerIndex (#2548) onto this
  // canvas, so a path-qualified `owns` frames only the node it names.
  const axis =
    placement?.axis ??
    (groupBy === "team" && ownerIndex !== undefined
      ? projectPathIndexOntoCanvas(ownerIndex, scopePath)
      : undefined);
  return {
    bandOrder: placement?.groupOrder ?? declaredGroupOrder,
    groupIndex: axis !== undefined && axis.size > 0 ? axis : undefined,
  };
}

/**
 * Shared group-collapse + grouped-layer-assignment machinery for the
 * single-system (`layout()`) and multi-system (`layoutMultipleSystems()`)
 * "Group by" paths (#1858 P2a, #1884). Folds any collapsed group's members to
 * a `<Group> (N)` stub and re-targets its edges (`collapseGroups`), then
 * buckets the (possibly collapsed) nodes into group bands via
 * `assignGroupedLayers`.
 *
 * A pure computation only — it does not decide whether the collapse is
 * *committed* when band assignment fails to produce groups. The two callers
 * differ there (`layout()` always keeps the collapsed nodes/edges once this
 * runs; `layoutMultipleSystems()` only adopts them when `grouped` comes back
 * non-null), so that decision is left to each call site to preserve today's
 * behavior exactly.
 */
export function collapseAndAssignGroupLayers({
  nodes,
  edges,
  groupIndex,
  collapsedGroups,
  edgeDiffState,
  stubScope,
  bandOrder,
  membership,
}: {
  nodes: readonly KrsNode[];
  edges: readonly KrsEdge[];
  groupIndex: Map<string, string>;
  collapsedGroups: ReadonlySet<string> | undefined;
  edgeDiffState: ReadonlyMap<string, string> | undefined;
  /** Namespaces collapse-stub ids (the enclosing system id); omitted in the single-system view. */
  stubScope?: string;
  /**
   * Band order for `assignGroupedLayers`. The boundary axis resolves it
   * alongside the placement axis (`resolvePlacementAxis`, #2176); the team axis
   * passes the declared ids and lets {@link groupOrderFor} merge them.
   */
  bandOrder: readonly string[] | undefined;
  /**
   * Full declared membership on the boundary axis (#2178). Three consumers: the
   * band order pulls boundaries that share members together and the seam bias
   * puts a shared node on the row that touches them (#2176), and the collapse
   * predicate folds a node only when every boundary it belongs to here is
   * collapsed (#2180). Omitted on the team axis, which stays 1:1 — all three
   * then reduce to no-ops.
   */
  membership?: ReadonlyMap<string, readonly string[]>;
}): {
  nodes: KrsNode[];
  edges: KrsEdge[];
  stubGroup: Map<string, string>;
  remapEndpoint: (id: string) => string;
  foldedEdgeDiffState: Map<string, string>;
  groupIdOf: (id: string) => string | null;
  /**
   * Nodes that survived the collapse because one of their boundaries is still
   * expanded, mapped to that boundary (#2180). The caller has its own group
   * resolver for the frames and has to consult this too, or the collapsed
   * group's frame keeps enclosing the survivor.
   */
  survivorGroup: Map<string, string>;
  grouped: GroupedLayerBands | null;
} {
  // Membership restricted to the boundaries that actually hold a band here.
  //
  // A declared boundary can end up with no band on this canvas — its members
  // live on other drill levels, or `resolvePlacementAxis` refused a claim that
  // would have emptied the band it takes from (#2176). Such a boundary draws no
  // frame, so the app (which builds its collapsible set from the rendered
  // `data-collapse-group` frames) can never collapse it. Judging "are all of
  // this node's boundaries collapsed?" against it would leave the node
  // permanently unfoldable, breaking the collapse-all view ADR-2120 promises.
  // The values of the placement axis are exactly the groups that get a band.
  const onCanvas = new Set(groupIndex.values());
  const onCanvasMembership =
    membership &&
    new Map([...membership].map(([id, groupIds]) => [id, groupIds.filter((g) => onCanvas.has(g))]));
  const collapsed = collapseGroups(
    nodes,
    edges,
    groupIndex,
    collapsedGroups,
    edgeDiffState,
    stubScope,
    // Boundary axis only: a shared node folds when every boundary it belongs to
    // here is collapsed (#2180). The team axis passes nothing and keeps its 1:1
    // predicate.
    onCanvasMembership,
  );
  // A node that survived the collapse did so because one of its boundaries is
  // still expanded — so that is the frame it belongs in. Without this it keeps
  // the band it was placed in before the collapse, and the *collapsed* group's
  // frame goes on enclosing it while the expanded one does not (#2180 C-1:
  // 「1 つでも expanded なら X は可視のまま、その expanded フレームの中に描かれる」).
  const survivorGroup = new Map<string, string>();
  if (onCanvasMembership !== undefined && collapsedGroups !== undefined) {
    for (const node of collapsed.nodes) {
      const placed = groupIndex.get(node.id);
      if (placed === undefined || !collapsedGroups.has(placed)) continue;
      const expanded = onCanvasMembership.get(node.id)?.find((g) => !collapsedGroups.has(g));
      if (expanded !== undefined) survivorGroup.set(node.id, expanded);
    }
  }
  const groupIdOf = (id: string): string | null =>
    survivorGroup.get(id) ?? groupIndex.get(id) ?? collapsed.stubGroup.get(id) ?? null;
  let grouped: GroupedLayerBands | null = null;
  if (groupIndex.size > 0) {
    const groupedNodes: GroupedNode[] = collapsed.nodes.map((n) => {
      const groupId = groupIdOf(n.id);
      // A collapse stub stands in for one group and has no membership of its
      // own, so it never carries a share — `membership` is keyed by real node.
      const declared = onCanvasMembership?.get(n.id) ?? membership?.get(n.id);
      return {
        id: n.id,
        groupId,
        ungroupedRank: systemTier(n),
        // The placement group leads, so `applySeamBias` reads the node's *other*
        // groups off the tail; a promoted member (#2176) is not in its own
        // declared list twice.
        ...(declared && groupId !== null
          ? { memberships: [groupId, ...declared.filter((g) => g !== groupId)] }
          : {}),
      };
    });
    // Group declaration order = first-appearance order in the axis map (the
    // parser inserts `owns` / `contains` in declaration order), so the
    // deterministic tie-break in `orderGroups` follows what the author wrote,
    // plus the declared groups the axis map cannot name (#2178). On the
    // boundary axis the caller already resolved it (#2176) so a claimed member
    // cannot reshuffle the stack.
    const result = assignGroupedLayers(
      groupedNodes,
      collapsed.edges.map((e) => ({ from: e.from, to: e.to })),
      membership !== undefined && bandOrder !== undefined
        ? [...bandOrder]
        : groupOrderFor(groupIndex, bandOrder),
    );
    if (result) {
      grouped = {
        layers: result.layers,
        groupBands: result.groupBands,
        groupOrder: result.groupOrder,
      };
    }
  }
  return {
    nodes: collapsed.nodes,
    edges: collapsed.edges,
    stubGroup: collapsed.stubGroup,
    survivorGroup,
    remapEndpoint: collapsed.remapEndpoint,
    foldedEdgeDiffState: collapsed.foldedEdgeDiffState,
    groupIdOf,
    grouped,
  };
}

/**
 * Group band id keyed by the band's first (top) layer, so the placement loop
 * can reserve vertical room for the band's frame title above that layer.
 * Empty when ungrouped. Shared by the single- and multi-system placement
 * phases.
 */
export function groupStartLayersOf(groupBands: Map<string, GroupBand> | null): Map<number, string> {
  const groupStartLayer = new Map<number, string>();
  if (groupBands) {
    for (const [gid, band] of groupBands) groupStartLayer.set(band.min, gid);
  }
  return groupStartLayer;
}
