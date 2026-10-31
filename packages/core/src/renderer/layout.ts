import type { KrsNode, KrsEdge } from "../types/ast.js";
import { displayGroupId } from "../types/ast.js";
import { collapseCategories } from "./category-collapse.js";
import { foldFacetMembership } from "./facet-overlay.js";
import { assignGroupedLayers, type GroupedNode, type GroupBand } from "./group-layout.js";
import { groupLabelsFor } from "./group-labels.js";
import type { ViewSlice } from "../view/view-slice.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { placeNodesInLayers } from "./layer-layout-logics.js";
import { searchWidthBudget } from "./aspect-search.js";
import {
  channelReservations,
  columnReservations,
  gutterReservations,
  type FrameSides,
} from "./layout-reservations.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import {
  CONTAINER_PADDING,
  CONTAINER_LABEL_HEIGHT,
  GHOST_MARGIN,
  getLayoutConstants,
} from "./layout-constants.js";
import { computeLayers, systemTier } from "./layer-assignment.js";
import { placeExternalServicesOnSides } from "./external-columns.js";
import {
  buildContainersForEmpty,
  centerRowsHorizontally,
  computeTotalDimensions,
  normalizeCoordinates,
} from "./layout-geometry.js";
import { computeLayoutEdges, portResolver, runRoutingChain } from "./layout-edges.js";
import {
  placeGhostUsers,
  placeGhostDomains,
  placeGhostEntities,
  placeCallerGhostSystems,
  placeOutgoingGhostSystems,
} from "./ghost-layout.js";
import {
  canvasFacetMembership,
  canvasLayoutHints,
  canvasMembershipFor,
  collapseAndAssignGroupLayers,
  containerLayoutHints,
  groupStartLayersOf,
  resolveCanvasAxis,
} from "./layout-grouping.js";
import { layoutMultipleSystems } from "./layout-multi-system.js";
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
  type OwnerResolver,
} from "./layout-measure.js";
import { nodePathRefId } from "../parser/node-path.js";
import { computeCrossingMarks } from "./crossing-marks.js";
import type { LayoutNode, ContainerRect, LayoutResult, LayoutOptions } from "./layout-types.js";

export type { LayoutNode, LayoutEdge, LayoutResult, DisplayMode } from "./layout-types.js";

/**
 * Lay out a view, choosing the row-width budget whose canvas holds the least
 * empty space (Issue #2593, `docs/design/canvas-space-objective.md`).
 *
 * `MAX_LAYER_WIDTH` is a constant, so a view whose cards are a hair too wide
 * for three-per-row wraps to two-per-row and then only grows downward —
 * nothing in the pipeline has ever read back the bounding box it produced.
 * The placement is pure, so it can simply be re-run over the candidate budgets
 * from `aspect-search.ts`; the smallest canvas inside the screen-shaped aspect
 * band wins. Content area is identical across candidates, so the smallest
 * canvas is the one with the least empty space.
 *
 * Scoring uses the **final** width/height — side external columns and
 * container chrome sit outside the layered content box, and scoring that box
 * alone overshoots into a wide canvas (the dify root view went 1.16 → 2.28
 * before this was corrected).
 *
 * The floor candidate is today's constant and only a strictly smaller canvas
 * displaces it, so a canvas no wider budget can shrink keeps byte-identical
 * output. That is a claim about area rather than shape — a landscape canvas
 * can still be displaced if widening drops a row.
 */
export function layout(viewSlice: ViewSlice, options: LayoutOptions = {}): LayoutResult {
  const { MAX_LAYER_WIDTH } = getLayoutConstants(options.displayMode);
  const found = searchWidthBudget(
    (budget) => layoutInner(viewSlice, options, budget),
    (candidate) => ({
      width: candidate.result.width,
      height: candidate.result.height,
      // A budget reaches the placement only through the row-width bound, so a
      // run whose rows were never cut by it cannot be improved by widening.
      // Most views are in this shape, and skipping their remaining candidates
      // is what keeps the search off the render hot path.
      exhausted: candidate.result.widthBound === false,
    }),
    { floor: MAX_LAYER_WIDTH },
  );
  // Channel capacity (#2608): the routing chain has now shown how many runs
  // each inter-row channel carries. Where a channel needs more room than its
  // default gap holds at `LANE_PITCH`, place once more with that room
  // reserved above the row — and only once. The width budget stays the one
  // the search picked: re-searching on the taller canvas could change the
  // winner, and with it the rows the reservation is keyed on (ADR-2593 found
  // the placement is not monotone in the budget). Views whose channels fit
  // never take this branch, so their output is unchanged byte for byte.
  const reservations = channelReservations(
    found.result.result,
    found.result.rows,
    found.result.enclosure,
  );
  // Column capacity (#2611): the same measurement on the horizontal axis. A
  // long edge that found no free lane between the rows it crosses had to run
  // out to a gutter; where a row carries more such columns than the gaps
  // between its cards can hold at `TRUNK_LANE_GAP`, the missing width is
  // opened inside that row. Joined to the channel reservation above so both
  // are applied by **one** re-placement: `placementPasses` stays 1 or 2, the
  // bound ADR-2598 set.
  const columns = columnReservations(found.result.result, found.result.rows);
  const sides = gutterReservations(found.result.result, found.result.enclosure);
  const reserved = reservations.size > 0 || columns.size > 0 || sides !== undefined;
  const run = reserved
    ? layoutInner(viewSlice, options, found.budget, reservations, columns, sides)
    : found.result;
  const result = run.result;
  // Crossing marks decorate the routed edges and change neither the canvas
  // nor the reservation, so only the surviving placement pays for them. A
  // search that evaluated four candidates and re-placed once used to compute
  // them five times for one drawing (#2761).
  if (run.crossingMarksPending) result.crossingMarks = computeCrossingMarks(result.edges);
  result.widthBudget = found.budget;
  result.placementPasses = reserved ? 2 : 1;
  result.shapeInsetsApplied = !!options.shapeForNode && options.displayMode !== "icon";
  return result;
}

/**
 * One placement run and the row structure it produced. `rows` is what the
 * channel reservation keys on; it is empty on paths that have no canvas-wide
 * row ordinal (the multi-system root, an empty container), which is exactly
 * where no reservation is made.
 */
interface LayoutRun {
  result: LayoutResult;
  rows: readonly (readonly string[])[];
  /**
   * The run routed edges but did not compute their crossing marks. Marks are
   * a pure function of the routed edges and feed nothing before the render
   * (`computeTotalDimensions` and the channel reservation never read them),
   * so `layout()` computes them once, on the placement that wins, instead of
   * once per width-budget candidate (#2761). False on the empty-view path,
   * which has never carried marks.
   */
  crossingMarksPending: boolean;
  /**
   * The drill-down frame the routing chain bounded its channels by (#3132),
   * so the reservation measures the same channels. `undefined` on the paths
   * that pass the chain none.
   */
  enclosure?: ContainerRect;
}

function layoutInner(
  viewSlice: ViewSlice,
  options: LayoutOptions,
  /** The candidate row-width budget this run is placing for (#2593). */
  widthBudget: number,
  /** Channel capacity to reserve above each row ordinal on a second pass (#2608). */
  extraGapBeforeRow?: ReadonlyMap<number, number>,
  /** Column capacity to reserve inside rows on that same second pass (#2611). */
  extraGapBeforeCard?: ReadonlyMap<number, ReadonlyMap<string, number>>,
  /** Gutter capacity to reserve inside the drill-down frame's sides (#3154). */
  extraFrameSides?: FrameSides,
): LayoutRun {
  const {
    ownerIndex,
    teamLabels,
    declaredGroupOrder,
    groupLabels,
    displayMode,
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
    // Each system stacks its own rows side by side, so there is no canvas-wide
    // row ordinal to reserve channel capacity on: the root view keeps its
    // default gaps (#2608 slice A's stated limit; see the parent's Slice status).
    return {
      result: layoutMultipleSystems(viewSlice, options, measureCtx, widthBudget),
      rows: [],
      crossingMarksPending: true,
    };
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
  // A domain spliced onto this canvas by in-place expansion (#1921) sits under
  // its expanded service, not directly under the canvas scope, so its full
  // path carries that service (#2917: `Shop.Api.Orders`, not `Shop.Orders`).
  const expandedParentOf = new Map<string, string>();
  for (const frame of viewSlice.expandedFrames) {
    for (const memberId of frame.memberIds) expandedParentOf.set(memberId, frame.containerId);
  }
  const canvasPathOf = (nid: string): string[] => {
    const expandedParent = expandedParentOf.get(nid);
    return expandedParent !== undefined ? [...scopePath, expandedParent, nid] : [...scopePath, nid];
  };
  const canvasHints = canvasLayoutHints(options, viewSlice.childNodes, canvasPathOf);
  // ownerIndex is keyed by full path (#2548): a real canvas node's path is
  // the canvas scope plus its id (plus the expanded service for a spliced
  // domain). The ghost placers below keep the raw `ownerOf` — their qualified
  // ids are already full paths. Synthetic ids (collapse / category stubs)
  // simply miss the index, exactly as before.
  const canvasOwnerOf: OwnerResolver = (kind, nid) =>
    ownerOf(kind, nodePathRefId(canvasPathOf(nid)));

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
      result: {
        nodes: new Map(),
        edges: [],
        containers,
        width: outermost ? outermost.x + outermost.width + CONTAINER_PADDING : 0,
        height: outermost ? outermost.y + outermost.height + CONTAINER_PADDING : 0,
        // Nothing was placed, so no budget can change this canvas. Saying so
        // ends the search after one run instead of laying an empty view out
        // once per candidate.
        widthBound: false,
      },
      rows: [],
      crossingMarksPending: false,
    };
  }

  // Force kind-based layering (user → client → service) when this looks like
  // a system view (i.e. there is at least one user/client among the children).
  // Otherwise fall back to topological sort, which is what drill-down views
  // (services, domains) need to lay out their internal structure.
  //
  // `forcedLayers` also gates the within-layer ordering downstream: the
  // barycenter pass runs only where it is null, because Q11 of the design doc
  // requires declaration order within forced layers.
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

  // `grid-columns` hint lives on the focused container and governs how its
  // direct children wrap. Absent a hint, the column count auto-balances
  // (see `gridColumnCount`).
  const containerGridHint = viewSlice.containerNode
    ? containerLayoutHints(options, viewSlice.containerNode.id, scopePath)?.gridColumns
    : undefined;

  // Group-by mode: reserve a vertical gap above each group's first row for its
  // boundary-frame title (keyed by the group's top layer). No-op when ungrouped.
  const groupStartLayer = groupStartLayersOf(groupBands);

  // Order, wrap and stack the layers. Shared with the multi-system path
  // (#2514) so the two cannot drift on the wrap threshold or on whether
  // crossings get minimised.
  const placed = placeNodesInLayers({
    sortedLayers,
    nodesByLayer,
    edges: allEdges,
    edgeDirections,
    layers,
    forcedLayers,
    layoutHints: canvasHints,
    gridHint: containerGridHint,
    groupStartLayer,
    widthBudget,
    extraGapBeforeRow,
    extraGapBeforeCard,
    gaps: {
      layerGap: LAYER_GAP,
      nodeGap: NODE_GAP,
      maxLayerWidth: MAX_LAYER_WIDTH,
      groupTitleGap: GROUP_FRAME_TITLE_GAP,
    },
    measure: (nid) => {
      const krsNode = nodeMap.get(nid)!;
      return measureNode(krsNode, canvasOwnerOf(krsNode.kind, nid), measureCtx, canvasPathOf(nid));
    },
  });
  childMaxWidth = placed.childMaxWidth;
  childMaxHeight = placed.childMaxHeight;
  for (const [nid, box] of placed.placements) {
    const krsNode = nodeMap.get(nid)!;
    layoutNodes.set(
      nid,
      makeLayoutNode(krsNode, nid, {
        label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
        annotations: effectiveAnnotations(krsNode),
        owner: canvasOwnerOf(krsNode.kind, nid),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        // The node's full path, which `data-node-path` carries (#2917); the
        // same path the owner lookup above resolves.
        path: canvasPathOf(nid),
      }),
    );
  }

  // Center each sub-row within the container so the grid reads as centered
  // columns.
  // Rows with a reserved column keep the gaps the placement opened; centring
  // them by re-packing at `NODE_GAP` would close the very width that was
  // reserved (#2611).
  centerRowsHorizontally(
    layoutNodes,
    childMaxWidth,
    NODE_GAP,
    extraGapBeforeCard !== undefined && extraGapBeforeCard.size > 0,
  );

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
  if (extraFrameSides && hasContainer && viewSlice.containerNode) {
    for (const [, node] of layoutNodes) node.x += extraFrameSides.left;
    childMaxWidth += extraFrameSides.left + extraFrameSides.right;
  }

  // Build container rects
  const containers: ContainerRect[] = [];
  /** The drill-down frame around the canvas's cards, when there is one (#3132). */
  let focusFrame: ContainerRect | undefined;

  if (hasContainer && viewSlice.containerNode) {
    // Focused container wraps child nodes
    const containerX = totalNestOffset - CONTAINER_PADDING;
    const containerY = totalNestOffset - CONTAINER_LABEL_HEIGHT - CONTAINER_PADDING / 2;
    const containerW = childMaxWidth - totalNestOffset + CONTAINER_PADDING * 2;
    const containerH =
      childMaxHeight - totalNestOffset + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;
    focusFrame = {
      id: viewSlice.containerNode.id,
      label: viewSlice.containerNode.label ?? viewSlice.containerNode.id,
      x: containerX,
      y: containerY,
      width: Math.max(containerW, 200),
      height: Math.max(containerH, 100),
      ghost: false,
      path: scopePath,
    };
    containers.push(focusFrame);
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
      path: viewSlice.ancestorChain.slice(0, i + 1).map((n) => n.id),
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
      // An expanding canvas frames containers, not teams or boundaries: its
      // group ids come from `expandGroupIdOf`, so neither axis's id space
      // applies and no style override may be looked up against them (#2269).
      // `expandMembership` is only filled when `groupBy` is unset, so today this
      // is always `groupBy`; it stays written out because the invariant lives
      // there and not here, and the two are allowed to grow apart.
      isExpanding ? undefined : groupBy,
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
        canvasHints,
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
      // Only a Group-by axis makes the canvas *grouped* for routing. In-place
      // expansion borrows the band stack to place its frames, but it is a
      // drill-down affordance on the ungrouped canvas: handing its bands to
      // the chain switched on trunk aggregation (#1859 P2c-B), which #2364
      // rejected for ungrouped canvases, and merged every fan-in pair onto
      // one spine and one target entry — #2490's shared corridor and anchor.
      // The frames still shape the routes: they are obstacles and endpoints
      // through the two arguments above.
      groupBands: groupBy ? groupBands : null,
      ports: portResolver(options),
      enclosure: focusFrame,
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
  return {
    result: {
      nodes: layoutNodes,
      edges: layoutEdges,
      containers,
      width: totalWidth,
      height: totalHeight,
      widthBound: placed.widthBound,
      foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
      foldedFacetMembership: foldFacetMembership(
        viewSlice.childNodes,
        remapGhostEndpoint,
        canvasFacetMembership(options, canvasPathOf),
        options.facetOrder ?? [],
      ),
      degradedMemberships,
    },
    // A side-placed external (#1728) left its row for a side column, so its y
    // no longer says where the row is; the remaining members do.
    rows: placed.rows.map((row) => row.filter((id) => !sideExternals.has(id))),
    crossingMarksPending: true,
    enclosure: focusFrame,
  };
}
