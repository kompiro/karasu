import type { KrsNode, KrsEdge } from "../types/ast.js";
import { displayGroupId } from "../types/ast.js";
import { collapseNodeList, collapseCategories } from "./category-collapse.js";
import { foldFacetMembership } from "./facet-overlay.js";
import { assignGroupedLayers, type GroupedNode, type GroupBand } from "./group-layout.js";
import { groupLabelsFor } from "./group-labels.js";
import { withChildAnchoredEdges } from "../view/view-extract.js";
import type { ViewSlice } from "../view/view-extract.js";
import type { ResolvedLayoutHints } from "../types/style.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import {
  sortByBarycenter,
  bucketByColumn,
  applyEdgeDirectionWithinLayer,
  gridColumnCount,
  wrapLayerIntoRows,
} from "./layer-layout-logics.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import {
  CONTAINER_PADDING,
  CONTAINER_LABEL_HEIGHT,
  GHOST_MARGIN,
  getLayoutConstants,
} from "./layout-constants.js";
import { computeLayers, systemTier } from "./layer-assignment.js";
import {
  buildContainersForEmpty,
  centerRowsHorizontally,
  computeTotalDimensions,
  normalizeCoordinates,
} from "./layout-geometry.js";
import {
  computeLayoutEdges,
  computeEdgePoints,
  portResolver,
  runRoutingChain,
} from "./layout-edges.js";
import {
  placeGhostUsers,
  placeGhostDomains,
  placeGhostEntities,
  placeCallerGhostSystems,
  placeOutgoingGhostSystems,
} from "./ghost-layout.js";
import {
  canvasMembershipFor,
  collapseAndAssignGroupLayers,
  groupStartLayersOf,
  resolveCanvasAxis,
} from "./layout-grouping.js";
import {
  GROUP_FRAME_TITLE_GAP,
  buildGroupFrames,
  boundaryHueIndexer,
  markDegradedMemberships,
  type FrameReach,
} from "./group-frames.js";
import {
  makeLayoutNode,
  makeOwnerResolver,
  measureNode,
  type MeasureContext,
} from "./layout-measure.js";
import { computeCrossingMarks } from "./crossing-marks.js";
import type {
  LayoutNode,
  LayoutEdge,
  ContainerRect,
  LayoutResult,
  LayoutOptions,
} from "./layout-types.js";

export type { LayoutNode, LayoutEdge, LayoutResult, DisplayMode } from "./layout-types.js";

const EXTERNAL_SIDE_GAP = 100;

/**
 * Spread below which the auto-assigned externals' hub barycenters count as one
 * value, so the median split has nothing to divide (#2384). Sub-pixel, so it
 * absorbs float noise from averaging node centres without ever merging two
 * barycenters a reader could tell apart.
 */
const SIDE_SPLIT_EPSILON = 0.5;

/**
 * Place `[external]` service nodes (systemTier 4) into left/right side columns
 * instead of the bottom band, so `service → external` edges run horizontally
 * and stop weaving through the downward infra fan-out (#1728, refines
 * ADR-1724). Runs *before* edge computation so `computeEdgePoints`
 * re-picks side anchors from the new relative positions.
 *
 * Side assignment: the consuming-hub barycenter x (median split, ties → left)
 * keeps each hub's external fan on one side, which minimizes cross-hub
 * crossings. When every auto-assigned external shares one barycenter the
 * median split degenerates — the median *is* that value, so every external
 * compares equal and the tie rule sends them all left regardless of where
 * their consumers sit (#2384). There is nothing to split in that case, so the
 * barycenter is compared against the content centre instead. An author can
 * override per node with the `column: left|right` style hint. Overflow keeps
 * stacking vertically on the side (no cap).
 *
 * Works for both single-system and multi-system root views: callers pass
 * the raw node list for the system being laid out and the ids of the
 * containers that should be widened to wrap the side columns.
 */
function placeExternalServicesOnSides(
  sourceNodes: KrsNode[],
  systemContainerIds: Set<string>,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  allEdges: KrsEdge[],
  layoutHints?: Map<string, ResolvedLayoutHints>,
): Map<string, "left" | "right"> {
  const sides = new Map<string, "left" | "right">();
  const extIds = new Set<string>();
  for (const c of sourceNodes) if (systemTier(c) === 4) extIds.add(c.id);
  if (extIds.size === 0) return sides;
  // Scope to THIS system's nodes only. In the multi-system path `layoutNodes`
  // accumulates every system placed so far, so without this scope the bbox
  // (min/max) below would span all systems and place this system's externals
  // at the global figure edge, overlapping its neighbours.
  const sourceIds = new Set(sourceNodes.map((c) => c.id));
  const ext = [...layoutNodes.values()].filter((n) => extIds.has(n.id) && !n.ghost);
  const others = [...layoutNodes.values()].filter(
    (n) => sourceIds.has(n.id) && !extIds.has(n.id) && !n.ghost,
  );
  if (ext.length === 0 || others.length === 0) return sides;

  // Gate: side placement only pays off when ≥2 distinct hubs fan out to
  // externals — the condition that produces cross-hub edge crossings (#1728).
  // A single-hub fan does not cross itself, so a simple diagram keeps the
  // compact bottom band (ADR-1724) rather than spreading wide. An
  // explicit `column: left|right` on any external still forces side placement.
  const hubs = new Set<string>();
  for (const ed of allEdges) if (extIds.has(ed.to)) hubs.add(ed.from);
  const hasExplicitSide = ext.some((n) => {
    const c = layoutHints?.get(n.id)?.column;
    return c === "left" || c === "right";
  });
  if (hubs.size < 2 && !hasExplicitSide) return sides;

  // Consuming-hub barycenter x per external (from explicit edges into it).
  const hubX = new Map<string, number>();
  for (const e of ext) {
    const xs = allEdges
      .filter((ed) => ed.to === e.id)
      .map((ed) => layoutNodes.get(ed.from))
      .filter((s): s is LayoutNode => !!s)
      .map((s) => s.x + s.width / 2);
    hubX.set(e.id, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : e.x + e.width / 2);
  }

  const minX = Math.min(...others.map((n) => n.x));
  const maxX = Math.max(...others.map((n) => n.x + n.width));
  const topY = Math.min(...others.map((n) => n.y));
  const botY = Math.max(...others.map((n) => n.y + n.height));

  // Median of the auto-assigned (non-hinted) externals' hub barycenters.
  const autoVals = ext
    .filter((n) => {
      const col = layoutHints?.get(n.id)?.column;
      return col !== "left" && col !== "right";
    })
    .map((n) => hubX.get(n.id) ?? 0)
    .sort((a, b) => a - b);
  // A median only splits a set that has spread. When every auto-assigned
  // barycenter coincides (one external, or several sharing the same hubs) the
  // median equals each value, so `<= median` holds for all of them and the
  // tie-break decides the whole set — the consuming hubs never get a say
  // (#2384). Fall back to the centre of the content span the side columns hug,
  // which keeps the rule coordinate-derived and deterministic (ADR-1728).
  //
  // "Coincide" is sub-pixel rather than bit-exact: these are means of node
  // centres, so mathematically equal barycenters can differ in the last bits
  // when the summation order differs between two externals. A spread thinner
  // than a pixel cannot support a meaningful split either way.
  const noSpread = autoVals[autoVals.length - 1] - autoVals[0] < SIDE_SPLIT_EPSILON;
  const threshold =
    !autoVals.length || noSpread
      ? (minX + maxX) / 2
      : autoVals[Math.floor((autoVals.length - 1) / 2)];
  const sideOf = (n: LayoutNode): "left" | "right" => {
    const col = layoutHints?.get(n.id)?.column;
    if (col === "left" || col === "right") return col;
    return (hubX.get(n.id) ?? 0) <= threshold ? "left" : "right";
  };

  const place = (group: LayoutNode[], x: number): void => {
    // Stable order within a side: hub-x, then consuming-hub y, then existing y.
    group.sort((a, b) => (hubX.get(a.id) ?? 0) - (hubX.get(b.id) ?? 0) || a.y - b.y);
    const count = group.length;
    group.forEach((node, i) => {
      node.x = x;
      node.y = topY + ((i + 1) * (botY - topY)) / (count + 1) - node.height / 2;
    });
  };
  const left = ext.filter((n) => sideOf(n) === "left");
  const right = ext.filter((n) => sideOf(n) === "right");
  // Per-side column width so a narrow side does not reserve the wide side's
  // gutter (each column hugs the system by its own widest member).
  const leftColW = left.reduce((m, n) => Math.max(m, n.width), 0);
  const rightColW = right.reduce((m, n) => Math.max(m, n.width), 0);
  place(left, minX - EXTERNAL_SIDE_GAP - leftColW);
  place(right, maxX + EXTERNAL_SIDE_GAP);
  for (const n of left) sides.set(n.id, "left");
  for (const n of right) sides.set(n.id, "right");

  // Grow the system container(s) to wrap the populated side columns.
  const leftEdge = left.length
    ? minX - EXTERNAL_SIDE_GAP - leftColW - CONTAINER_PADDING
    : undefined;
  const rightEdge = right.length
    ? maxX + EXTERNAL_SIDE_GAP + rightColW + CONTAINER_PADDING
    : undefined;
  for (const c of containers) {
    if (!systemContainerIds.has(c.id)) continue;
    let nx = c.x;
    let nr = c.x + c.width;
    if (leftEdge !== undefined) nx = Math.min(nx, leftEdge);
    if (rightEdge !== undefined) nr = Math.max(nr, rightEdge);
    c.x = nx;
    c.width = nr - nx;
  }
  return sides;
}

export function layout(viewSlice: ViewSlice, options: LayoutOptions = {}): LayoutResult {
  const result = layoutInner(viewSlice, options);
  result.shapeInsetsApplied = !!options.shapeForNode && options.displayMode !== "icon";
  return result;
}

function layoutInner(viewSlice: ViewSlice, options: LayoutOptions): LayoutResult {
  const {
    ownerIndex,
    teamLabels,
    declaredGroupOrder,
    groupLabels,
    displayMode,
    layoutHints,
    edgeDirections,
    collapsedCategories,
    groupBy,
    collapsedGroups,
    edgeDiffState,
  } = options;
  const ownerOf = makeOwnerResolver(ownerIndex, teamLabels);
  const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);
  // Build the inherited-annotations map from the focused container's subtree
  // (or all systems for the root view). Within a single drill-down view, IDs
  // are unique by construction, so this map can be safely keyed by id and
  // disambiguates the migration-coexistence scenario where the same `domain
  // Order` appears under multiple annotated services across the project.
  const inheritedAnnotations = buildInheritedAnnotations(
    viewSlice.containerNode ? [viewSlice.containerNode] : viewSlice.systems,
  );
  const effectiveAnnotations = (n: KrsNode): string[] =>
    n.annotations.length > 0 ? n.annotations : (inheritedAnnotations.get(n.id) ?? n.annotations);
  const measureCtx: MeasureContext = {
    displayMode,
    shapeForNode: options.shapeForNode,
    effectiveAnnotations,
  };

  // Multi-system root view: lay out all systems side by side. The same path
  // also handles the single-system case when that system is the synthesized
  // "Unassigned" pseudo-system, so it still gets its own labeled frame
  // instead of rendering as a frameless peer list.
  const isUnassignedOnly =
    viewSlice.systems.length === 1 && viewSlice.systems[0].id === "__unassigned__";
  if (viewSlice.systems.length > 1 || isUnassignedOnly) {
    return layoutMultipleSystems(viewSlice, options, measureCtx);
  }

  // The canvas being drawn is the container plus its ancestors — for the root
  // system view that is the system itself (`containerNode` is set, with an empty
  // ancestor chain), which is the scope a top-level-looking `system X { boundary
  // … }` declares into. Resolved after the multi-system dispatch: the root view
  // resolves membership per system frame, not from this scope.
  const scopePath =
    viewSlice.containerNode !== null
      ? [...viewSlice.ancestorChain.map((n) => n.id), viewSlice.containerNode.id]
      : [];
  const canvasMembership = canvasMembershipFor(scopePath, options);

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

  if (
    allNodes.length === 0 &&
    viewSlice.ghostUsers.length === 0 &&
    viewSlice.ghostSystems.length === 0 &&
    viewSlice.callerGhostSystems.length === 0
  ) {
    // Empty container: still produce container rects
    const containers = buildContainersForEmpty(viewSlice);
    const outermost = containers.length > 0 ? containers[0] : null;
    return {
      nodes: new Map(),
      edges: [],
      containers,
      width: outermost ? outermost.x + outermost.width + CONTAINER_PADDING : 0,
      height: outermost ? outermost.y + outermost.height + CONTAINER_PADDING : 0,
    };
  }

  // Force kind-based layering (user → client → service) when this looks like
  // a system view (i.e. there is at least one user/client among the children).
  // Otherwise fall back to topological sort, which is what drill-down views
  // (services, domains) need to lay out their internal structure.
  //
  // Note: this single-system path doesn't currently apply a barycenter sort —
  // declaration order falls out of the Map iteration. If barycenter is added
  // here in the future, gate it on `forcedLayers === null` (Q11 of the design
  // doc requires declaration order within forced layers).
  const { layers, forcedLayers } = computeLayers(allNodes, allEdges, groupedLayers, edgeDirections);

  // Position nodes inside the container area
  const layoutNodes = new Map<string, LayoutNode>();
  let childMaxWidth = 0;
  let childMaxHeight = 0;

  const nodesByLayer = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
    nodesByLayer.get(layer)!.push(id);
  }

  const nodeMap = new Map<string, KrsNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

  // System view: bucket by column hint while preserving declaration order
  // within each bucket. The single-system path does not run a barycenter
  // pass (Q11 of the layout design doc), so the input order *is* the
  // declaration order, and bucketing is the only x-axis intervention.
  const orderedByLayer = new Map<number, string[]>();
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    const bucketed =
      forcedLayers !== null && layoutHints && layoutHints.size > 0
        ? bucketByColumn(
            nodesInLayer.map((id) => ({ id })),
            layoutHints,
          ).map((item) => item.id)
        : nodesInLayer;
    const ordered = applyEdgeDirectionWithinLayer(bucketed, allEdges, edgeDirections, layers);
    orderedByLayer.set(layerIdx, ordered);
  }

  // `grid-columns` hint lives on the focused container and governs how its
  // direct children wrap. Absent a hint, the column count auto-balances
  // (see `gridColumnCount`).
  const containerGridHint = viewSlice.containerNode
    ? layoutHints?.get(viewSlice.containerNode.id)?.gridColumns
    : undefined;

  // Compute initial positions (will be offset later for container nesting).
  // y is fixed per sub-row (max bottom of previously-placed rows) so
  // heterogeneous-height nodes share a top baseline. Without this,
  // `y = layerIdx * (dims.height + LAYER_GAP)` would push the *tallest*
  // node in a row down — a service with a team chip would dive below
  // its rowmate cylinders / clouds. Mirrors the multi-system path.
  //
  // Within each layer, many siblings wrap into a balanced grid
  // (`gridColumnCount` columns, or the author's `grid-columns`), bounded by
  // `MAX_LAYER_WIDTH`, so a wide sibling set does not sprawl into one
  // unreadable row that forces a zoom-out (scoped glance, resolution axis).
  // Group-by mode: reserve a vertical gap above each group's first row for its
  // boundary-frame title (keyed by the group's top layer). No-op when ungrouped.
  const groupStartLayer = groupStartLayersOf(groupBands);

  let layerBaselineY = NODE_GAP;
  for (const layerIdx of sortedLayers) {
    if (groupStartLayer.has(layerIdx)) layerBaselineY += GROUP_FRAME_TITLE_GAP;
    const nodesInLayer = orderedByLayer.get(layerIdx)!;
    const dimsById = new Map<string, { width: number; height: number }>();
    for (const nid of nodesInLayer) {
      const krsNode = nodeMap.get(nid)!;
      dimsById.set(nid, measureNode(krsNode, ownerOf(krsNode.kind, nid), measureCtx));
    }
    const columnCount = gridColumnCount(nodesInLayer.length, containerGridHint);
    const rows = wrapLayerIntoRows(
      nodesInLayer,
      (nid) => dimsById.get(nid)!.width,
      columnCount,
      MAX_LAYER_WIDTH,
      NODE_GAP,
    );

    let rowY = layerBaselineY;
    let layerBottom = layerBaselineY;
    for (const row of rows) {
      let xOffset = NODE_GAP;
      let rowMaxHeight = 0;
      for (const nid of row) {
        const krsNode = nodeMap.get(nid)!;
        const dims = dimsById.get(nid)!;

        layoutNodes.set(
          nid,
          makeLayoutNode(krsNode, nid, {
            label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
            annotations: effectiveAnnotations(krsNode),
            owner: ownerOf(krsNode.kind, nid),
            x: xOffset,
            y: rowY,
            width: dims.width,
            height: dims.height,
          }),
        );

        xOffset += dims.width + NODE_GAP;
        childMaxWidth = Math.max(childMaxWidth, xOffset);
        rowMaxHeight = Math.max(rowMaxHeight, dims.height);
      }
      layerBottom = rowY + rowMaxHeight;
      childMaxHeight = Math.max(childMaxHeight, layerBottom + NODE_GAP);
      rowY = layerBottom + NODE_GAP; // sub-row gap within the layer
    }
    layerBaselineY = layerBottom + LAYER_GAP;
  }

  // Center each sub-row within the container so the grid reads as centered
  // columns.
  centerRowsHorizontally(layoutNodes, childMaxWidth, NODE_GAP);

  // Build containers (innermost first: focused container, then ancestors)
  const hasContainer =
    viewSlice.ancestorChain.length > 0 || viewSlice.containerNode?.kind !== "system";

  // Calculate the offset needed for nesting
  const containerCount = viewSlice.ancestorChain.length + (hasContainer ? 1 : 0);
  const totalNestOffset =
    containerCount * GHOST_MARGIN + (hasContainer ? CONTAINER_LABEL_HEIGHT : 0);

  // Offset all child nodes for nesting
  if (totalNestOffset > 0) {
    for (const [, node] of layoutNodes) {
      node.x += totalNestOffset;
      node.y += totalNestOffset;
    }
    childMaxWidth += totalNestOffset;
    childMaxHeight += totalNestOffset;
  }

  // Build container rects
  const containers: ContainerRect[] = [];

  if (hasContainer && viewSlice.containerNode) {
    // Focused container wraps child nodes
    const containerX = totalNestOffset - CONTAINER_PADDING;
    const containerY = totalNestOffset - CONTAINER_LABEL_HEIGHT - CONTAINER_PADDING / 2;
    const containerW = childMaxWidth - totalNestOffset + CONTAINER_PADDING * 2;
    const containerH =
      childMaxHeight - totalNestOffset + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;
    containers.push({
      id: viewSlice.containerNode.id,
      label: viewSlice.containerNode.label ?? viewSlice.containerNode.id,
      x: containerX,
      y: containerY,
      width: Math.max(containerW, 200),
      height: Math.max(containerH, 100),
      ghost: false,
    });
  }

  // Ghost ancestor containers (inner to outer)
  for (let i = viewSlice.ancestorChain.length - 1; i >= 0; i--) {
    const ancestor = viewSlice.ancestorChain[i];
    const depth = viewSlice.ancestorChain.length - i; // 1 for immediate parent
    const margin = depth * GHOST_MARGIN;
    const innerContainer = containers.length > 0 ? containers[containers.length - 1] : null;

    let gx: number, gy: number, gw: number, gh: number;
    if (innerContainer) {
      gx = innerContainer.x - GHOST_MARGIN;
      gy = innerContainer.y - GHOST_MARGIN;
      gw = innerContainer.width + GHOST_MARGIN * 2;
      gh = innerContainer.height + GHOST_MARGIN * 2;
    } else {
      gx = margin;
      gy = margin;
      gw = childMaxWidth + CONTAINER_PADDING;
      gh = childMaxHeight + CONTAINER_PADDING;
    }

    containers.push({
      id: ancestor.id,
      label: ancestor.label ?? ancestor.id,
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      ghost: true,
    });
  }

  // Reverse so outermost is first
  containers.reverse();

  /** Memberships this canvas showed as a 縮退 tab rather than a frame (#2179). */
  let degradedMemberships: { nodeId: string; boundaryId: string }[] | undefined;

  // Group boundary frames (#1858, P2a): one dashed titled frame enclosing each
  // team's members (design § P1 measurement 1). Built from final node positions
  // via the shared helper the multi-system path also uses (#1884).
  if (groupBands && (groupIndex || isExpanding)) {
    const expandMeta = isExpanding
      ? (groupId: string) => {
          const frame = viewSlice.expandedFrames.find((f) => f.containerId === groupId);
          return frame
            ? { label: frame.label, expanded: true, nodeId: frame.containerId }
            : undefined;
        }
      : undefined;
    // Expansion frames enclose their own members (by container), not the team
    // buckets `groupIdOf` would report for an `owns` model (#1921).
    const frameGroupIdOf = isExpanding ? expandGroupIdOf : groupIdOf;
    // Expansion meta wins where it applies; otherwise the group's declared
    // label titles the frame (#2133), with the display-id fallback inside
    // buildGroupFrames covering label-less groups. Labels resolve against this
    // canvas's scope — scoped entries are keyed by their scope-qualified group
    // id (#2036), matching the ids boundaryAxisFor put on the axis.
    const canvasLabels = groupLabelsFor(groupLabels, scopePath);
    const frameMeta = (groupId: string) => {
      const meta = expandMeta?.(groupId);
      if (meta) return meta;
      const label = canvasLabels?.get(groupId);
      return label !== undefined ? { label } : undefined;
    };
    // Multi-containment (#2179) is a boundary-axis affordance: only there does a
    // node carry more than one group, and only there are overlapping frames the
    // intended reading. Team frames pass no `reach` and stay exactly as before.
    const hueIndexOf = boundaryHueIndexer(declaredGroupOrder, groupOrder);
    const reach: FrameReach | undefined =
      groupBy === "boundary" && canvasMembership && !isExpanding
        ? { membershipOf: (id) => canvasMembership.get(id) ?? [], hueIndexOf }
        : undefined;
    const { degraded } = buildGroupFrames(
      [...layoutNodes.values()],
      groupOrder,
      frameGroupIdOf,
      containers,
      frameMeta,
      reach,
    );
    markDegradedMemberships(
      degraded,
      layoutNodes,
      (groupId) => canvasLabels?.get(groupId) ?? displayGroupId(groupId),
      hueIndexOf,
    );
    if (degraded.length > 0) degradedMemberships = degraded;
  }

  // Place ghost nodes
  placeGhostUsers(viewSlice, layoutNodes, containers, measureCtx);
  placeGhostDomains(viewSlice, layoutNodes, containers, measureCtx);
  placeGhostEntities(viewSlice, layoutNodes, containers, measureCtx);
  placeCallerGhostSystems(viewSlice, layoutNodes, containers, ownerOf, measureCtx);
  placeOutgoingGhostSystems(viewSlice, layoutNodes, containers, ownerOf, measureCtx);

  // Move [external] services to side columns before edges are computed, so
  // anchors re-pick sides from the new positions (#1728). Skipped in group-by
  // mode: externals belong to their group's frame (or the trailing un-grouped
  // band), and pulling them to the canvas sides would break that placement.
  const sideExternals = groupBands
    ? new Map<string, "left" | "right">()
    : placeExternalServicesOnSides(
        viewSlice.childNodes,
        new Set(viewSlice.systems.map((s) => s.id)),
        layoutNodes,
        containers,
        allEdges,
        layoutHints,
      );

  // Boundary-frame boxes for in-place-expanded containers, keyed by the expanded
  // service id, so a service-level edge whose endpoint was expanded anchors on
  // the frame border instead of dropping (#1921).
  const expandedFrameRects = isExpanding
    ? new Map(
        containers
          .filter((c) => c.expanded && c.nodeId !== undefined)
          .map((c) => [c.nodeId!, c] as const),
      )
    : undefined;
  // Give each expanded frame a layer (its band's top row) so `computeEdgePoints`
  // picks the correct vertical anchor for edges touching it — otherwise the
  // frame id is absent from `layers`, defaults to layer 0, and a top-tier→frame
  // edge is mis-routed as same-layer (#1921).
  if (isExpanding && groupBands) {
    for (const frame of viewSlice.expandedFrames) {
      const band = groupBands.get(frame.containerId);
      if (band) layers.set(frame.containerId, band.min);
    }
  }

  // Compute all edges (regular + ghost)
  const layoutEdges = computeLayoutEdges(
    viewSlice,
    layoutNodes,
    layers,
    containers,
    allEdges,
    sideExternals,
    remapGhostEndpoint,
    expandedFrameRects,
  );

  // Shared routing candidate chain (#2362): ports → straight/channel-L →
  // gutter/mixed → trunks → lane separation → outline seating; see
  // runRoutingChain. In-place expansion (#1921/#1923) shares the chain: the
  // expanded frame rects let a service-level edge anchor on the frame border
  // and detour around the *other* frames, while an edge to an interior domain
  // still enters its own frame. The style-fed port resolver (#2422) turns on
  // outline seating.
  runRoutingChain(
    layoutNodes,
    layoutEdges,
    containers.filter((c) => c.group),
    {
      expandedFrames: expandedFrameRects,
      groupBands,
      ports: portResolver(options),
    },
  );

  // Annotate parallel-edge bundles (edges sharing `(from, to)`) so the
  // renderer can slide labels along the edge instead of stacking them at
  // the midpoint. Also nudges perpendicular whatever the passes above left
  // co-located — ghost/cyclic, which `distributePorts` skips by kind, and
  // frame-anchored edges, whose endpoints it cannot look up (#2477).
  // See ADR-1185 and ADR-2477.
  markParallelBundles(
    layoutEdges,
    (nodeId) => layoutNodes.get(nodeId) ?? expandedFrameRects?.get(nodeId),
  );

  // Normalize coordinates and compute dimensions
  normalizeCoordinates(containers, layoutNodes, layoutEdges);
  const { width: totalWidth, height: totalHeight } = computeTotalDimensions(
    containers,
    layoutNodes,
    layoutEdges,
    displayMode,
  );

  // Crossing marks (#1859 P2c-C, extended to the ungrouped view in #1956). Derived
  // from final coordinates for every single-system layout, grouped or not — hop
  // arcs neutralise crossings ("not connected") so the default view's crossings
  // read unambiguously too. Junction dots stay grouped-only (the ungrouped view
  // has no aggregation trunks). See docs/design/system-view-grouping.md.
  const crossingMarks = computeCrossingMarks(layoutEdges);

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    containers,
    width: totalWidth,
    height: totalHeight,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    foldedFacetMembership: foldFacetMembership(
      viewSlice.childNodes,
      remapGhostEndpoint,
      options.facetMembership,
      options.facetOrder ?? [],
    ),
    crossingMarks,
    degradedMemberships,
  };
}

/**
 * Lay out multiple systems side by side for root view.
 * All systems are rendered as full (non-ghost) nodes.
 */
function layoutMultipleSystems(
  viewSlice: ViewSlice,
  options: LayoutOptions,
  /**
   * layoutInner's measurement context, carrying its inheritance-based
   * annotation resolver — not this path's raw one (see {@link MeasureContext}).
   */
  measureCtx: MeasureContext,
): LayoutResult {
  const {
    ownerIndex,
    teamLabels,
    declaredGroupOrder,
    groupLabels,
    displayMode,
    layoutHints,
    edgeDirections,
    collapsedCategories,
    groupBy,
    collapsedGroups,
    edgeDiffState,
  } = options;
  const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);
  // Grouping axis (team = ownerIndex, boundary = the primary of
  // boundaryMembership); `ownerIndex` stays the per-card team badge source
  // regardless of axis (mirrors layout()).
  const ownerOf = makeOwnerResolver(ownerIndex, teamLabels);
  // Multi-system view places only services (one nesting level), and a system's
  // annotations do not propagate to its services, so no inheritance is needed.
  // This raw resolver feeds LayoutNode.annotations only — never assemble a
  // second MeasureContext from it: measurement stays on layoutInner's
  // measureCtx (inheritance-based), and that split is the #2515-tracked
  // divergence, not a free choice.
  const effectiveAnnotations = (n: KrsNode): string[] => n.annotations;
  const allLayoutNodes = new Map<string, LayoutNode>();
  const allContainers: ContainerRect[] = [];
  const allEdges: LayoutEdge[] = [];
  // Group-by-team (#1884): diff-state re-keyed onto collapsed-group stub edges,
  // accumulated across systems (empty unless a team collapses in diff mode).
  const foldedEdgeDiffState = new Map<string, string>();
  // Endpoint id → collapse-stub id, accumulated across systems, so cross-system
  // edges whose endpoint was folded into a collapsed team re-anchor onto the
  // stub instead of being dropped (#1884; mirrors the single-system ghost-edge
  // remap). Identity for un-collapsed endpoints.
  const crossSystemRemap = new Map<string, string>();
  /** 縮退 fallbacks across every system frame (#2179), in system order. */
  const allDegradedMemberships: { nodeId: string; boundaryId: string }[] = [];

  let offsetX = CONTAINER_PADDING;
  const offsetY = CONTAINER_PADDING;

  for (let si = 0; si < viewSlice.systems.length; si++) {
    const sys = viewSlice.systems[si];

    // Layout this system's children independently.
    // For the primary system (si === 0), use viewSlice.childNodes which includes
    // unassigned top-level domains merged in by extractView (legacy back-compat
    // for direct callers that pre-date the "Unassigned" pseudo-system).
    const rawNodes = collapseNodeList(
      si === 0 ? viewSlice.childNodes : sys.children,
      collapsedCategories,
    );

    // Group-by-team (#1884): apply the P2a grouping *inside this system's frame*
    // (per-(system, team) frames — a team that owns members in two systems shows
    // one frame in each; cross-system spanning frames stay out of scope, see
    // docs/design/system-view-grouping.md). Reuses the single-system machinery:
    // fold collapsed teams to `<Team> (N)` stubs, then band nodes by team via
    // `assignGroupedLayers`. Gated on group-by so ungrouped output is unchanged.
    let workNodes = rawNodes;
    // This path lays each system out from its own edges rather than from
    // `viewSlice.childEdges`, so it lifts the child-anchored ones itself —
    // otherwise `service S1 { S1 -> S2 }` survives extraction and is dropped
    // here, on the multi-system and `__unassigned__` roots (#2223).
    const sysEdges = withChildAnchoredEdges(sys);
    let workEdges: KrsEdge[] = sysEdges;
    let groupedLayers: Map<string, number> | null = null;
    let groupBandsS: Map<string, GroupBand> | null = null;
    let groupOrderS: string[] = [];
    let groupIdOf: (id: string) => string | null = () => null;
    // Each system frame is its own canvas, so a scoped boundary declared in
    // `system X { … }` applies inside X's frame and nowhere else (#2036); the
    // team axis stays model-wide.
    const systemMembership = canvasMembershipFor([sys.id], options);
    // Same per-canvas resolution as `layout()`: a boundary with no band of its
    // own claims one of the shared members present in *this* system (#2176).
    const { bandOrder: systemBandOrder, groupIndex: systemGroupIndex } = resolveCanvasAxis(
      systemMembership,
      new Set(rawNodes.map((n) => n.id)),
      options,
    );
    if (groupBy && systemGroupIndex) {
      // Scope stub ids by system id so a group owning members in ≥2 systems gets
      // a distinct `__group_collapsed_<sys>_<group>__` stub per system instead of
      // one colliding id that would overwrite in `allLayoutNodes` (#1884).
      const collapsed = collapseAndAssignGroupLayers({
        nodes: rawNodes,
        edges: sysEdges,
        groupIndex: systemGroupIndex,
        collapsedGroups,
        edgeDiffState,
        stubScope: sys.id,
        bandOrder: systemBandOrder,
        membership: systemMembership,
      });
      if (collapsed.grouped) {
        workNodes = collapsed.nodes;
        workEdges = collapsed.edges;
        groupedLayers = collapsed.grouped.layers;
        groupBandsS = collapsed.grouped.groupBands;
        groupOrderS = collapsed.grouped.groupOrder;
        groupIdOf = collapsed.groupIdOf;
        for (const [k, v] of collapsed.foldedEdgeDiffState) foldedEdgeDiffState.set(k, v);
        // Record each folded member → stub so cross-system edges re-anchor onto
        // the stub instead of dropping (#1884). Only when a team actually
        // collapsed — `remapEndpoint` is identity otherwise.
        if (collapsedGroups && collapsedGroups.size > 0) {
          for (const n of rawNodes) {
            const mapped = collapsed.remapEndpoint(n.id);
            if (mapped !== n.id) crossSystemRemap.set(n.id, mapped);
          }
        }
      }
    }

    const nodeIds = workNodes.map((n) => n.id);
    const idSet = new Set(nodeIds);
    // Only include intra-system edges for layout ordering. In group-by mode the
    // team bands come from `assignGroupedLayers` (non-null `groupedLayers`) and
    // win over the kind-tier layering.
    const { layers, forcedLayers } = computeLayers(
      workNodes,
      workEdges,
      groupedLayers,
      edgeDirections,
    );
    // Group bands start a new titled frame; reserve vertical room for the title.
    const groupStartLayer = groupStartLayersOf(groupBandsS);

    const nodesByLayer = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer)!.push(id);
    }
    const nodeMap = new Map<string, KrsNode>();
    for (const node of workNodes) nodeMap.set(node.id, node);

    const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

    // Build predecessors map for barycenter heuristic
    const predecessorsMap = new Map<string, string[]>();
    for (const id of nodeIds) predecessorsMap.set(id, []);
    for (const edge of workEdges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        predecessorsMap.get(edge.to)!.push(edge.from);
      }
    }

    // Tracks the X-center of each placed node (used by barycenter sort for subsequent layers)
    const nodeCenterX = new Map<string, number>();

    const localNodes = new Map<string, LayoutNode>();
    let childMaxWidth = 0;
    let childMaxHeight = 0;

    // `grid-columns` on this system governs how its direct children wrap.
    const sysGridHint = layoutHints?.get(sys.id)?.gridColumns;

    for (let layerOrder = 0; layerOrder < sortedLayers.length; layerOrder++) {
      const layerIdx = sortedLayers[layerOrder];
      const rawLayer = nodesByLayer.get(layerIdx)!.map((id) => ({ id }));
      // Sort by barycenter for all layers after the first to minimize edge
      // crossings. Skip when the forced system layout is in effect — Q11 of
      // the design doc requires preserving declaration order within each layer.
      const innerSorted =
        forcedLayers !== null || layerOrder === 0
          ? rawLayer
          : sortByBarycenter(rawLayer, predecessorsMap, nodeCenterX);
      const bucketed =
        forcedLayers !== null && layoutHints && layoutHints.size > 0
          ? bucketByColumn(innerSorted, layoutHints)
          : innerSorted;
      const sortedLayer = applyEdgeDirectionWithinLayer(
        bucketed.map((item) => item.id),
        workEdges,
        edgeDirections,
        layers,
      ).map((id) => ({ id }));

      // Place nodes with sub-row wrapping. A new sub-row starts when either
      // the balanced-grid column count is reached or the layer width would
      // exceed MAX_LAYER_WIDTH (whichever comes first).
      const columnCount = gridColumnCount(sortedLayer.length, sysGridHint);
      let colInRow = 0;
      let currentX = NODE_GAP;
      let subRowY = layerOrder === 0 ? NODE_GAP : 0; // will be computed below
      let subRowMaxHeight = 0;

      // Compute the Y start for this layer based on the previous layer's bottom
      if (layerOrder > 0) {
        // Find the max Y + height among all nodes placed in earlier layers
        let prevBottom = 0;
        for (const [, n] of localNodes) {
          prevBottom = Math.max(prevBottom, n.y + n.height + LAYER_GAP);
        }
        subRowY = prevBottom;
      } else {
        subRowY = NODE_GAP;
      }
      // Reserve room above a group band's first layer for its frame title.
      if (groupStartLayer.has(layerIdx)) subRowY += GROUP_FRAME_TITLE_GAP;

      for (const item of sortedLayer) {
        const nid = item.id;
        const krsNode = nodeMap.get(nid)!;
        const owner = ownerOf(krsNode.kind, nid);
        const dims = measureNode(krsNode, owner, measureCtx);

        // Wrap to a new sub-row at the column cap or when the node would
        // exceed MAX_LAYER_WIDTH.
        if (
          currentX > NODE_GAP &&
          (colInRow >= columnCount || currentX + dims.width > MAX_LAYER_WIDTH)
        ) {
          subRowY += subRowMaxHeight + NODE_GAP;
          currentX = NODE_GAP;
          subRowMaxHeight = 0;
          colInRow = 0;
        }

        localNodes.set(
          nid,
          makeLayoutNode(krsNode, nid, {
            label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
            annotations: effectiveAnnotations(krsNode),
            owner,
            x: currentX,
            y: subRowY,
            width: dims.width,
            height: dims.height,
          }),
        );

        nodeCenterX.set(nid, currentX + dims.width / 2);
        subRowMaxHeight = Math.max(subRowMaxHeight, dims.height);
        currentX += dims.width + NODE_GAP;
        colInRow += 1;
        childMaxWidth = Math.max(childMaxWidth, currentX);
        childMaxHeight = Math.max(childMaxHeight, subRowY + dims.height + NODE_GAP);
      }
    }

    // Center each sub-row within the system so the grid reads as centered
    // columns.
    centerRowsHorizontally(localNodes, childMaxWidth, NODE_GAP);

    const containerW = Math.max(childMaxWidth + CONTAINER_PADDING, 200);
    const containerH = Math.max(childMaxHeight + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING, 100);

    const containerRect: ContainerRect = {
      id: sys.id,
      label: sys.label ?? sys.id,
      x: offsetX,
      y: offsetY,
      width: containerW,
      height: containerH,
      ghost: false,
    };
    allContainers.push(containerRect);

    // Offset local nodes into global coordinate space
    for (const [id, node] of localNodes) {
      node.x += offsetX + CONTAINER_PADDING / 2;
      node.y += offsetY + CONTAINER_LABEL_HEIGHT;
      allLayoutNodes.set(id, node);
    }

    // Group boundary frames (#1884): one dashed titled frame per team, enclosing
    // that team's members *within this system's frame* (per-(system, team)),
    // via the shared helper the single-system path also uses. Built from final
    // (offset) node positions. A team that spans systems is framed once per
    // system, so two frames intentionally share the same `__group_<team>__`
    // container id (app collapse is keyed by team id → collapse-everywhere).
    // Where this system's group frames start in `allContainers`, so the routing
    // passes below can be handed exactly this system's frames (#2363).
    const frameStart = allContainers.length;
    if (groupBandsS) {
      // Labels resolve per system canvas ([sys.id]), matching the axis
      // resolution in boundaryAxisForSystem (#2133).
      const systemLabels = groupLabelsFor(groupLabels, [sys.id]);
      // Multi-containment per system frame (#2179): a boundary spans one system
      // here (cross-system frames are out of scope), so the reach is resolved
      // against this system's membership and this system's cards only.
      const hueIndexOf = boundaryHueIndexer(declaredGroupOrder, groupOrderS);
      const reach: FrameReach | undefined =
        groupBy === "boundary" && systemMembership
          ? { membershipOf: (id) => systemMembership.get(id) ?? [], hueIndexOf }
          : undefined;
      const { degraded } = buildGroupFrames(
        [...localNodes.values()],
        groupOrderS,
        groupIdOf,
        allContainers,
        (groupId) => {
          const label = systemLabels?.get(groupId);
          return label !== undefined ? { label } : undefined;
        },
        reach,
      );
      markDegradedMemberships(
        degraded,
        localNodes,
        (groupId) => systemLabels?.get(groupId) ?? displayGroupId(groupId),
        hueIndexOf,
      );
      allDegradedMemberships.push(...degraded);
    }

    // Move [external] services to side columns for this system (#1728). Skipped
    // in group-by mode: externals belong to their group's frame (or the trailing
    // un-grouped band), so pulling them to the canvas sides would break that
    // placement (mirrors the single-system path).
    const sideExternals = groupBandsS
      ? new Map<string, "left" | "right">()
      : placeExternalServicesOnSides(
          workNodes,
          new Set([sys.id]),
          allLayoutNodes,
          allContainers,
          sysEdges,
          layoutHints,
        );

    // Intra-system edges
    const systemEdges: LayoutEdge[] = [];
    for (const edge of workEdges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        const le = computeEdgePoints(edge, allLayoutNodes, layers, sideExternals);
        if (le) {
          systemEdges.push(le);
          allEdges.push(le);
        }
      }
    }

    // Route this system's edges (#2363). Until now the root view ran none of the
    // routing passes, so even a *grouped* root got bands and frames but
    // straight-line edges that pierced whatever lay between their endpoints.
    //
    // Scoped per system rather than across the canvas: obstacles, content bounds
    // and therefore gutter x are all derived from the nodes handed in, and a
    // canvas-wide gutter would send an edge inside one system out past every
    // other system. Each system block is its own routing surface, the same way
    // `placeExternalServicesOnSides` is already applied per system.
    const systemFrames = allContainers.slice(frameStart).filter((c) => c.group);
    runRoutingChain(localNodes, systemEdges, systemFrames, {
      // In-place expansion is single-system only (#1921).
      expandedFrames: undefined,
      groupBands: groupBandsS,
      // No port resolver on this path — no outline seating on the root view;
      // tracked by #2515.
      ports: undefined,
    });

    // A gutter route runs outside the system's cards, so it can reach past the
    // container rect. Advance by the routed extent, not just the rect, or the
    // next system's cards would sit on top of this one's edges.
    //
    // The baseline stays `offsetX + width`, not `containerRect.x + width`: a
    // left side column (#1728) shifts the rect's own x leftwards, so measuring
    // from it would hand the next system less room than before and let the two
    // containers overlap.
    let routedRight = offsetX + containerRect.width;
    for (const e of systemEdges) {
      for (const p of [e.fromPoint, ...(e.waypoints ?? []), e.toPoint]) {
        routedRight = Math.max(routedRight, p.x);
      }
    }
    offsetX = routedRight + GHOST_MARGIN * 3;
  }

  // Cross-system edges. When a team is collapsed (#1884), an endpoint here may
  // have been folded into that team's stub — re-anchor onto the stub via
  // `crossSystemRemap` instead of silently dropping the edge (mirrors the
  // single-system ghost-edge remap; TPL-1738: a collapsed node's edges
  // must resolve both endpoints). De-dupe *only* re-targeted edges (one stub can
  // absorb several), so authored parallel cross-system edges between two
  // expanded nodes are untouched and the un-collapsed path stays byte-identical.
  const seenCrossStub = new Set<string>();
  for (const edge of viewSlice.crossSystemEdges) {
    const fromId = crossSystemRemap.get(edge.from) ?? edge.from;
    const dot = edge.to.indexOf(".");
    const toService = edge.to.slice(dot + 1);
    const toServiceRemapped = crossSystemRemap.get(toService) ?? toService;
    const retargeted = fromId !== edge.from || toServiceRemapped !== toService;
    const toField =
      toServiceRemapped !== toService ? edge.to.slice(0, dot + 1) + toServiceRemapped : edge.to;
    const fromNode = allLayoutNodes.get(fromId);
    const toNode = allLayoutNodes.get(toServiceRemapped);
    if (!fromNode || !toNode) continue;
    if (retargeted) {
      const key = `${fromId}->${toField}`;
      if (seenCrossStub.has(key)) continue;
      seenCrossStub.add(key);
    }
    allEdges.push({
      from: fromId,
      to: toField,
      // A re-targeted edge stands for one-or-more real edges, so drop its label.
      label: retargeted ? undefined : edge.label,
      fromPoint: {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      },
      toPoint: {
        x: toNode.x,
        y: toNode.y + toNode.height / 2,
      },
    });
  }

  markParallelBundles(allEdges, (nodeId) => allLayoutNodes.get(nodeId));

  // The first system's left side column (#1728) can extend to negative x;
  // shift everything back into the positive quadrant so it isn't clipped.
  // No-op when nothing went negative (the common case without side columns).
  normalizeCoordinates(allContainers, allLayoutNodes, allEdges);

  // Calculate total dimensions from container rects only. The single-system
  // path uses computeTotalDimensions, which also folds node and edge-waypoint
  // extents into the maximum — a divergence deliberately preserved by the
  // #2512 refactor; converging it (and the clipping it can cause) is #2513.
  let totalWidth = 0;
  let totalHeight = 0;
  for (const c of allContainers) {
    totalWidth = Math.max(totalWidth, c.x + c.width + CONTAINER_PADDING);
    totalHeight = Math.max(totalHeight, c.y + c.height + CONTAINER_PADDING);
  }

  // Hop marks for the root view too (#2363). Derived from final coordinates like
  // the single-system path, and computed over *all* edges so a cross-system line
  // crossing an intra-system one is marked as well.
  const crossingMarks = computeCrossingMarks(allEdges);

  return {
    nodes: allLayoutNodes,
    edges: allEdges,
    containers: allContainers,
    width: totalWidth,
    height: totalHeight,
    crossingMarks,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    degradedMemberships: allDegradedMemberships.length > 0 ? allDegradedMemberships : undefined,
  };
}
