/**
 * Collapse and grouping prep for one single-system canvas (#3440): the
 * category collapse (#1821), the grouping axis (#1858, #1822), the per-group
 * collapse (#1858 slice B) and the in-place expansion band (#1921), run in that
 * order before the layers are computed. `layoutInner` reads what they leave
 * through {@link CanvasGrouping}; the multi-system root runs its own per-frame
 * copy in `layout-multi-system.ts`.
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import type { ViewSlice } from "../view/view-slice.js";
import { collapseCategories } from "./category-collapse.js";
import { assignGroupedLayers, type GroupedNode, type GroupBand } from "./group-layout.js";
import { systemTier } from "./layer-assignment.js";
import { collapseAndAssignGroupLayers, resolveCanvasAxis } from "./layout-grouping.js";
import type { LayoutOptions } from "./layout-types.js";

/**
 * The canvas after both collapses, and how its nodes group. Every field is read
 * further down `layoutInner`; `stubGroup` and `survivorGroup` stay inside, read
 * only through `groupIdOf`.
 */
export interface CanvasGrouping {
  allNodes: KrsNode[];
  allEdges: KrsEdge[];
  groupIndex: Map<string, string> | undefined;
  remapGhostEndpoint: (id: string) => string;
  foldedEdgeDiffState: Map<string, string>;
  groupedLayers: Map<string, number> | null;
  groupBands: Map<string, GroupBand> | null;
  groupOrder: string[];
  isExpanding: boolean;
  groupIdOf: (id: string) => string | null;
  expandGroupIdOf: (id: string) => string | null;
}

/**
 * Collapse the canvas's nodes and edges and resolve how they group.
 * `canvasMembership` and `scopePath` are the canvas's own, as `layoutInner`
 * resolved them.
 */
export function prepareCanvasGrouping(
  viewSlice: ViewSlice,
  options: LayoutOptions,
  canvasMembership: Map<string, string[]> | undefined,
  scopePath: readonly string[],
): CanvasGrouping {
  const { collapsedCategories, groupBy, collapsedGroups, edgeDiffState } = options;
  // Category collapse (#1821): fold external/infra tiers to a `⊕ N` stub and
  // **re-target** their boundary-crossing edges onto the stub (so "who depends
  // on the external/infra layer" survives as aggregation trunks, not dropped).
  const collapsedCat = collapseCategories(
    viewSlice.childNodes,
    viewSlice.childEdges,
    collapsedCategories,
  );
  let allNodes = collapsedCat.nodes;
  let allEdges: KrsEdge[] = collapsedCat.edges;

  // The grouping axis (#1858 P2a = team, #1822 P2b = boundary). `ownerIndex`
  // stays the team-badge source on every card regardless of axis; only the
  // *grouping* logic below switches to `groupIndex`. Resolved after the category
  // collapse because a boundary with no band of its own claims one of its shared
  // members (#2176), and only the nodes still on the canvas can be claimed.
  const { bandOrder, groupIndex } = resolveCanvasAxis(
    canvasMembership,
    new Set(allNodes.map((n) => n.id)),
    options,
    scopePath,
  );

  // Per-group collapse (#1858 slice B): when a team is collapsed, fold its
  // members to a `<Team> (N)` stub and re-target cross-group edges onto it, so
  // "collapse all" yields the group-dependency-DAG view. Only meaningful in
  // group-by mode with an ownerIndex; a no-op otherwise. `stubGroup` tells the
  // grouping code which group a stub stands in for.
  let stubGroup = new Map<string, string>();
  // Survivors of a partial collapse belong to the boundary that is still
  // expanded, and the frames are built from the resolver below (#2180).
  let survivorGroup = new Map<string, string>();
  // Ghost-edge lists on the ViewSlice are separate fields that neither collapse
  // pass rewrites (they only touch childNodes/childEdges), so re-anchor a
  // collapsed member's ghost connectors onto its stub with the *same* remap the
  // collapse applied to the regular edges (#1874). Category and group members
  // are disjoint, so composing the two remaps (category first, then group) is
  // order-independent in practice; identity outside collapse.
  let remapGhostEndpoint: (id: string) => string = collapsedCat.remapEndpoint;
  // Diff state re-keyed onto collapsed-group stub edges (#1886). Empty unless a
  // team collapses in compare/diff mode; merged into the render lookup below.
  let foldedEdgeDiffState = new Map<string, string>();
  // System-view grouping (#1858, P2a): when the viewer picks "Group by: team",
  // bucket nodes into their owning team instead of the kind tiers, stacking each
  // team as a dependency-ordered band that a boundary frame can enclose. Falls
  // back to the ungrouped layout when nothing is grouped (no org / no owns), so
  // this only ever changes output for a model that both opts in and has owners.
  let groupedLayers: Map<string, number> | null = null;
  let groupBands: Map<string, GroupBand> | null = null;
  let groupOrder: string[] = [];
  if (groupBy && groupIndex) {
    const collapsed = collapseAndAssignGroupLayers({
      nodes: allNodes,
      edges: allEdges,
      groupIndex,
      collapsedGroups,
      edgeDiffState,
      bandOrder,
      membership: canvasMembership,
    });
    allNodes = collapsed.nodes;
    allEdges = collapsed.edges;
    stubGroup = collapsed.stubGroup;
    survivorGroup = collapsed.survivorGroup;
    const groupRemap = collapsed.remapEndpoint;
    remapGhostEndpoint = (id) => groupRemap(collapsedCat.remapEndpoint(id));
    foldedEdgeDiffState = collapsed.foldedEdgeDiffState;
    if (collapsed.grouped) {
      groupedLayers = collapsed.grouped.layers;
      groupBands = collapsed.grouped.groupBands;
      groupOrder = collapsed.grouped.groupOrder;
    }
  }
  /** Group a node belongs to — its team owner, or the group a collapse stub stands in for. */
  // In-place expansion (#1921): map each expanded container's spliced domain
  // members to their container id so the group-band machinery frames them.
  // Orthogonal to Group by: team (Phase 1 targets the ungrouped system view),
  // so it only ever engages when not grouping by team.
  const expandMembership = new Map<string, string>();
  if (!groupBy) {
    for (const frame of viewSlice.expandedFrames) {
      for (const memberId of frame.memberIds) expandMembership.set(memberId, frame.containerId);
    }
  }
  const isExpanding = expandMembership.size > 0;

  const groupIdOf = (id: string): string | null =>
    survivorGroup.get(id) ??
    groupIndex?.get(id) ??
    stubGroup.get(id) ??
    expandMembership.get(id) ??
    null;

  // Expansion groups *only* by the expanded container — never by team owner
  // (#1921). A model with `owns` populates `ownerIndex`, and the shared
  // `groupIdOf` prefers it, which would bucket the expanded domains into their
  // team and leave the expansion band empty (no frame). In ungrouped mode
  // (the only mode expansion runs in) teams do not form bands, so expansion
  // must use its own membership exclusively.
  const expandGroupIdOf = (id: string): string | null => expandMembership.get(id) ?? null;

  // In-place expansion band (#1921): reuse the two-level group layout so an
  // expanded container's domain children occupy a contiguous, framed band among
  // the collapsed sibling boxes. Runs only when not already grouping by team.
  if (isExpanding && !groupedLayers) {
    const groupedNodes: GroupedNode[] = allNodes.map((n) => ({
      id: n.id,
      groupId: expandGroupIdOf(n.id),
      ungroupedRank: systemTier(n),
    }));
    const expansionGroupOrder = viewSlice.expandedFrames.map((f) => f.containerId);
    const grouped = assignGroupedLayers(
      groupedNodes,
      allEdges.map((e) => ({ from: e.from, to: e.to })),
      expansionGroupOrder,
    );
    if (grouped) {
      groupedLayers = grouped.layers;
      groupBands = grouped.groupBands;
      groupOrder = grouped.groupOrder;
    }
  }

  return {
    allNodes,
    allEdges,
    groupIndex,
    remapGhostEndpoint,
    foldedEdgeDiffState,
    groupedLayers,
    groupBands,
    groupOrder,
    isExpanding,
    groupIdOf,
    expandGroupIdOf,
  };
}
