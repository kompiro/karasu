import type { KrsNode, KrsEdge } from "../types/ast.js";
import { displayGroupId } from "../types/ast.js";
import { collapseCategories } from "./category-collapse.js";
import { foldFacetMembership } from "./facet-overlay.js";
import { assignGroupedLayers, type GroupedNode, type GroupBand } from "./group-layout.js";
import { groupLabelsFor } from "./group-labels.js";
import { withChildAnchoredEdges } from "../view/view-extract.js";
import type { ViewSlice } from "../view/view-extract.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { placeNodesInLayers, ROW_END_COLUMN } from "./layer-layout-logics.js";
import { searchWidthBudget } from "./aspect-search.js";
import { collectChannels, LANE_PITCH } from "./edge-routing-lanes.js";
import { framePieces, TRUNK_LANE_GAP } from "./edge-routing-groups.js";
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
  type OwnerResolver,
} from "./layout-measure.js";
import { nodePathIdentityKey, nodePathKey } from "../parser/node-path.js";
import { computeCrossingMarks } from "./crossing-marks.js";
import type {
  LayoutNode,
  LayoutEdge,
  ContainerRect,
  LayoutResult,
  LayoutOptions,
} from "./layout-types.js";

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
  const reservations = channelReservations(found.result.result, found.result.rows);
  // Column capacity (#2611): the same measurement on the horizontal axis. A
  // long edge that found no free lane between the rows it crosses had to run
  // out to a gutter; where a row carries more such columns than the gaps
  // between its cards can hold at `TRUNK_LANE_GAP`, the missing width is
  // opened inside that row. Joined to the channel reservation above so both
  // are applied by **one** re-placement: `placementPasses` stays 1 or 2, the
  // bound ADR-2598 set.
  const columns = columnReservations(found.result.result, found.result.rows);
  const reserved = reservations.size > 0 || columns.size > 0;
  const run = reserved
    ? layoutInner(viewSlice, options, found.budget, reservations, columns)
    : found.result;
  const result = run.result;
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
}

/**
 * Extra gap each placement row needs above it so the channel there holds its
 * measured traffic at `LANE_PITCH` (#2608), keyed by row ordinal — the unit
 * `placeNodesInLayers` counts, sub-rows included, because collisions happen
 * between sub-rows too. Empty when every channel fits its default gap: the
 * threshold sits at "fits the current constant", the floor-first shape
 * ADR-2593 settled on, so a view that never needed the room is not grown.
 */
function channelReservations(
  result: LayoutResult,
  rows: readonly (readonly string[])[],
): Map<number, number> {
  const out = new Map<number, number>();
  if (rows.length < 2) return out;
  const rowTop = rows.map((row) =>
    row.reduce((top, id) => Math.min(top, result.nodes.get(id)?.y ?? Infinity), Infinity),
  );
  const frames = result.containers.filter((c) => c.group).flatMap(framePieces);
  for (const channel of collectChannels(result.nodes, result.edges, frames)) {
    // A channel bounded on one side only (above the first row, below the
    // last) has no row gap to grow; the lane pass clamps there instead.
    if (!Number.isFinite(channel.upper) || !Number.isFinite(channel.lower)) continue;
    const extra = channel.lanes * LANE_PITCH - (channel.lower - channel.upper);
    if (extra <= 0) continue;
    // The row the channel runs above: the first whose top is at or below the
    // band's floor (a frame's top may sit between the two). A row every member
    // of which left for a side column has no top (`Infinity`) and is not a
    // row the channel can run above.
    const rowBelow = rowTop.findIndex((top) => Number.isFinite(top) && top >= channel.lower - 0.5);
    if (rowBelow <= 0) continue;
    out.set(rowBelow, Math.max(out.get(rowBelow) ?? 0, extra));
  }
  return out;
}

/**
 * Extra width each row needs inside it so the columns crossing it have lanes
 * to run in (#2611), keyed by row ordinal → the id of the card the width is
 * opened before (or {@link ROW_END_COLUMN}). The horizontal counterpart of
 * {@link channelReservations}, measured the same way: what the routing chain
 * was observed to carry, against what the placement actually offers.
 *
 * **Traffic.** Every edge the chain sent out to an *outer* gutter although its
 * endpoints sit two or more rows apart is a column the interior could not
 * hold. Edges into one target share a column (the P2c-B trunk rule), so they
 * are counted once — one per target is what the reservation has to fit, and
 * counting one per edge measured +12% canvas on dify against +4% for the
 * shared count.
 *
 * **Capacity.** A row offers a lane every `TRUNK_LANE_GAP` inside each gap
 * between two neighbouring cards, plus the room beside its outer cards, minus
 * the lanes routes already took there. Reserving against the *free* capacity
 * rather than the total is what keeps a view that merely re-used its existing
 * gaps from growing at all.
 *
 * Empty when every row's free capacity already covers its traffic, so a view
 * that does not need a column is byte-identical — floor-first, as ADR-2593
 * settled and ADR-2598 kept.
 */
function columnReservations(
  result: LayoutResult,
  rows: readonly (readonly string[])[],
): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  // Two rows have no row *between* them, so no column can be reserved.
  if (rows.length < 3) return out;
  const cardsOfRow = rows.map((row) =>
    row
      .map((id) => result.nodes.get(id))
      .filter((n): n is LayoutNode => !!n && !n.ghost)
      .sort((a, b) => a.x - b.x),
  );
  if (cardsOfRow.some((cards) => cards.length === 0)) return out;
  const rowOf = new Map<string, number>();
  rows.forEach((row, r) => row.forEach((id) => rowOf.set(id, r)));
  const nodes = [...result.nodes.values()].filter((n) => !n.ghost);
  const minLeft = Math.min(...nodes.map((n) => n.x));
  const maxRight = Math.max(...nodes.map((n) => n.x + n.width));

  // Traffic: one column per target, spanning the rows strictly between the
  // endpoints' rows. `xs` collects where each member would have liked to run,
  // so the reservation is opened where the routes actually want it.
  const columns = new Map<string, { xs: number[]; lo: number; hi: number }>();
  for (const edge of result.edges) {
    if (edge.ghost || edge.cyclic) continue;
    if (!isOuterGutterRoute(edge, minLeft, maxRight)) continue;
    const from = result.nodes.get(edge.from);
    const to = result.nodes.get(edge.to);
    const rf = rowOf.get(edge.from);
    const rt = rowOf.get(edge.to);
    if (!from || !to || rf === undefined || rt === undefined) continue;
    if (Math.abs(rf - rt) < 2) continue;
    const ideal = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
    const lo = Math.min(rf, rt) + 1;
    const hi = Math.max(rf, rt) - 1;
    const column = columns.get(edge.to);
    if (column) {
      column.xs.push(ideal);
      column.lo = Math.min(column.lo, lo);
      column.hi = Math.max(column.hi, hi);
    } else columns.set(edge.to, { xs: [ideal], lo, hi });
  }
  if (columns.size === 0) return out;

  for (let r = 1; r < rows.length - 1; r++) {
    const wanted = [...columns.values()].filter((c) => c.lo <= r && r <= c.hi);
    if (wanted.length === 0) continue;
    const cards = cardsOfRow[r];
    // **One** column per short row, not the whole shortfall. Measured on the
    // dify corpus (21 views, 1,102 edges): opening one column where a row is
    // short takes 39.5% of the gutter routes into the interior, with
    // crossings −18.7%, route length −13.1% and canvas area −9.7% against
    // main. Opening the full shortfall takes more of them off the gutters
    // (51.6%) and is worse everywhere it counts — crossings −13.1%, length
    // −8.3%, area −8.6% — because every extra column widens the row it is in,
    // and each edge that follows it crosses the runs of the rows it now
    // passes. The first column is the one that pays: it turns "no way
    // through this row at all" into "a way through".
    const free = freeLanesAcrossRow(result, cards, minLeft, maxRight);
    const shortfall = Math.min(1, wanted.length - free);
    if (shortfall <= 0) continue;
    // Where: the mean of what the columns crossing this row were aiming at,
    // resolved to the card that follows it. An id, not the x itself — the
    // second pass re-centres every row, so an x measured on the first would
    // point somewhere else by the time it were applied (TPL-2611).
    const target =
      wanted.reduce((sum, c) => sum + c.xs.reduce((a, b) => a + b, 0) / c.xs.length, 0) /
      wanted.length;
    const after = cards.find((n) => n.x >= target);
    const slot = out.get(r) ?? new Map<string, number>();
    slot.set(after ? after.id : ROW_END_COLUMN, shortfall * TRUNK_LANE_GAP);
    out.set(r, slot);
  }
  return out;
}

/**
 * Whether an edge runs along one of the outer gutters — its first vertical run
 * sits beyond the content on either side. The interior corridors and the
 * staircase routes both keep their verticals within the content, so this is
 * "the chain could not place this edge inside", stated on the route rather
 * than on the number of its waypoints (TPL-1954: a shape-counting test stops
 * seeing a shape the moment a new one is added).
 */
function isOuterGutterRoute(edge: LayoutEdge, minLeft: number, maxRight: number): boolean {
  const wps = edge.waypoints ?? [];
  const run = wps.find((w, i) => i + 1 < wps.length && Math.abs(w.x - wps[i + 1].x) < 1e-6);
  return run !== undefined && (run.x < minLeft || run.x > maxRight);
}

/**
 * Lanes a row can still offer a column: one every `TRUNK_LANE_GAP` inside each
 * gap between neighbouring cards and in the room beside the outer ones, less
 * the ones routes already run in over this row's band. Counted on the band
 * between the channels above and below the row, because that is the stretch a
 * column crossing the row has to be free over.
 */
function freeLanesAcrossRow(
  result: LayoutResult,
  cards: readonly LayoutNode[],
  minLeft: number,
  maxRight: number,
): number {
  const top = Math.min(...cards.map((n) => n.y));
  const bottom = Math.max(...cards.map((n) => n.y + n.height));
  let lanes = 0;
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < cards.length; i++) {
    spans.push([cards[i].x + cards[i].width, cards[i + 1].x]);
  }
  spans.push([minLeft, cards[0].x], [cards[cards.length - 1].x + cards[cards.length - 1].width, maxRight]);
  for (const [left, right] of spans) {
    if (right - left >= TRUNK_LANE_GAP) lanes += Math.floor((right - left) / TRUNK_LANE_GAP);
  }
  // Verticals already crossing this row's band, wherever they run inside the
  // content: each one is a lane a new column cannot have.
  const taken = new Set<number>();
  for (const edge of result.edges) {
    if (edge.ghost || edge.cyclic) continue;
    const pts = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) > 1e-6) continue;
      if (a.x < minLeft || a.x > maxRight) continue;
      if (Math.min(a.y, b.y) > bottom || Math.max(a.y, b.y) < top) continue;
      taken.add(Math.round(a.x / TRUNK_LANE_GAP));
    }
  }
  return Math.max(0, lanes - taken.size);
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
): LayoutRun {
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
    // Each system stacks its own rows side by side, so there is no canvas-wide
    // row ordinal to reserve channel capacity on: the root view keeps its
    // default gaps (#2608 slice A's stated limit; see the parent's Slice status).
    return { result: layoutMultipleSystems(viewSlice, options, measureCtx, widthBudget), rows: [] };
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
  // ownerIndex is keyed by full path (#2548): a real canvas node's path is
  // the canvas scope plus its id. The ghost placers below keep the raw
  // `ownerOf` — their qualified ids are already full paths. Synthetic ids
  // (collapse / category stubs) simply miss the index, exactly as before.
  const canvasOwnerOf: OwnerResolver = (kind, nid) =>
    ownerOf(kind, nodePathKey([...scopePath, nid]));

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
    ? layoutHints?.get(viewSlice.containerNode.id)?.gridColumns
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
    layoutHints,
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
      return measureNode(krsNode, canvasOwnerOf(krsNode.kind, nid), measureCtx);
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
        options.facetMembership,
        options.facetOrder ?? [],
      ),
      crossingMarks,
      degradedMemberships,
    },
    // A side-placed external (#1728) left its row for a side column, so its y
    // no longer says where the row is; the remaining members do.
    rows: placed.rows.map((row) => row.filter((id) => !sideExternals.has(id))),
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
  /** The candidate row-width budget this run is placing for (#2593). */
  widthBudget: number,
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
  // One annotation resolver for both the cards and their measurement (#2515).
  // This path used to keep a raw `n.annotations` resolver of its own next to
  // the inheritance-based one measureNode reads, which is two sources of truth
  // for the same question. They agree on every node placed here — inheritance
  // starts at `service` and flows to its descendants, and the root view places
  // the services themselves — so adopting the shared one changes nothing today
  // and stays correct if this path ever places a service's children.
  const { effectiveAnnotations } = measureCtx;
  const allLayoutNodes = new Map<string, LayoutNode>();
  // True as soon as any system's rows were cut by the width budget (#2593).
  let anyWidthBound = false;
  const allContainers: ContainerRect[] = [];
  const allEdges: LayoutEdge[] = [];
  // Group-by-team (#1884): diff-state re-keyed onto collapsed-group stub edges,
  // accumulated across systems (empty unless a team collapses in diff mode).
  const foldedEdgeDiffState = new Map<string, string>();
  // Endpoint id → collapse-stub id, accumulated across systems, so cross-system
  // edges whose endpoint was folded into a collapsed team re-anchor onto the
  // stub instead of being dropped (#1884; mirrors the single-system ghost-edge
  // remap). Identity for un-collapsed endpoints.
  // Keyed by `nodePathIdentityKey([<system id>, <child id>])`, not by the bare
  // child id: two systems may each hold a child of the same name, and since
  // #2646 they fold to *distinct* per-system stubs, so a bare key would let the
  // last system laid out decide where every other system's edge lands.
  const crossSystemRemap = new Map<string, string>();
  // The same folds keyed by bare child id, for the one endpoint whose system
  // cannot be established: compare mode keeps a *removed* cross-system edge from
  // the before slice, and the merged `systems` carry the after node's edges, so
  // that edge is in no system's list here. `null` marks a child id two systems
  // both fold, where the honest answer is "unknown" and the endpoint stays put
  // rather than anchoring onto an arbitrary system's stub.
  const crossSystemRemapUnscoped = new Map<string, string | null>();
  // Which system each cross-system edge starts in. `viewSlice.crossSystemEdges`
  // is flattened across systems and does not carry that, and the source endpoint
  // has to re-anchor onto *its own* system's stub. Keyed by edge identity, since
  // `withChildAnchoredEdges` hands back the model's own edge objects rather than
  // copies: `Alpha.Ext -> Gamma.Cli` and `Beta.Ext -> Gamma.Cli` are equal as
  // text and belong to different systems. A miss (compare mode's removed edges)
  // falls through to the unscoped map above.
  const crossSystemSource = new Map<KrsEdge, string>();
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
    const systemNodes = si === 0 ? viewSlice.childNodes : sys.children;
    // This path lays each system out from its own edges rather than from
    // `viewSlice.childEdges`, so it lifts the child-anchored ones itself —
    // otherwise `service S1 { S1 -> S2 }` survives extraction and is dropped
    // here, on the multi-system and `__unassigned__` roots (#2223).
    const systemRawEdges = withChildAnchoredEdges(sys);
    // Category collapse (#1821), with the same edge re-targeting the
    // single-system path applies (#1872, #2646): fold this system's
    // external/infra tier to a `⊕ N` stub and re-anchor the edges that crossed
    // the category boundary onto it. Folding the *nodes* alone left every such
    // edge with an endpoint outside `idSet` below, so the root view silently
    // dropped it and drew a stub nothing pointed at (TPL-219: the multi-system
    // path must not quietly lose a feature the single-system path has).
    // Scope the stub ids by system id, the way the group collapse does (#1884):
    // two systems that each fold `infra` would otherwise both synthesize
    // `__collapsed_infra__` and overwrite one another in `allLayoutNodes`,
    // leaving one system's trunk pointing at a card that is never drawn.
    const sysCollapsedCat = collapseCategories(
      systemNodes,
      systemRawEdges,
      collapsedCategories,
      sys.id,
    );
    const rawNodes = sysCollapsedCat.nodes;
    const sysEdges = sysCollapsedCat.edges;

    // Group-by-team (#1884): apply the P2a grouping *inside this system's frame*
    // (per-(system, team) frames — a team that owns members in two systems shows
    // one frame in each; cross-system spanning frames stay out of scope, see
    // docs/design/system-view-grouping.md). Reuses the single-system machinery:
    // fold collapsed teams to `<Team> (N)` stubs, then band nodes by team via
    // `assignGroupedLayers`. Gated on group-by so ungrouped output is unchanged.
    let workNodes = rawNodes;
    let workEdges: KrsEdge[] = sysEdges;
    let groupedLayers: Map<string, number> | null = null;
    let groupBandsS: Map<string, GroupBand> | null = null;
    let groupOrderS: string[] = [];
    let groupIdOf: (id: string) => string | null = () => null;
    // Endpoint remap the group collapse applied, for the cross-system re-anchor
    // below. Identity unless a team in this system actually collapsed.
    let groupRemap: (id: string) => string = (id) => id;
    // Each system frame is its own canvas, so a scoped boundary declared in
    // `system X { … }` applies inside X's frame and nowhere else (#2036).
    // The synthesized "Unassigned" pseudo-system holds top-level orphans
    // whose full paths carry no system prefix, so its frame scope is empty.
    const frameScope = sys.id === "__unassigned__" ? [] : [sys.id];
    // Path-keyed owner lookups for this frame's real nodes (#2548), same
    // shape as `canvasOwnerOf` on the single-system path.
    const frameOwnerOf: OwnerResolver = (kind, nid) =>
      ownerOf(kind, nodePathKey([...frameScope, nid]));
    const systemMembership = canvasMembershipFor(frameScope, options);
    // Same per-canvas resolution as `layout()`: a boundary with no band of its
    // own claims one of the shared members present in *this* system (#2176).
    const { bandOrder: systemBandOrder, groupIndex: systemGroupIndex } = resolveCanvasAxis(
      systemMembership,
      new Set(rawNodes.map((n) => n.id)),
      options,
      frameScope,
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
          groupRemap = collapsed.remapEndpoint;
        }
      }
    }
    // Cross-system edges are a separate list that neither collapse pass
    // rewrites, so record this system's folded members → stub for the re-anchor
    // below (#1884 for groups, #2646 for categories). Composed category-first,
    // matching the order the two folds ran in: a category member that no longer
    // exists cannot also be folded into a group stub.
    for (const n of systemNodes) {
      const mapped = groupRemap(sysCollapsedCat.remapEndpoint(n.id));
      if (mapped === n.id) continue;
      crossSystemRemap.set(nodePathIdentityKey([sys.id, n.id]), mapped);
      const prior = crossSystemRemapUnscoped.get(n.id);
      crossSystemRemapUnscoped.set(n.id, prior === undefined || prior === mapped ? mapped : null);
    }
    for (const e of systemRawEdges) {
      if (e.to.includes(".")) crossSystemSource.set(e, sys.id);
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

    // Order, wrap and stack this system's layers with the same helper the
    // single-system path uses (#2514).
    const placed = placeNodesInLayers({
      sortedLayers,
      nodesByLayer,
      edges: workEdges,
      edgeDirections,
      layers,
      forcedLayers,
      layoutHints,
      // `grid-columns` on this system governs how its direct children wrap.
      gridHint: layoutHints?.get(sys.id)?.gridColumns,
      groupStartLayer,
      widthBudget,
      gaps: {
        layerGap: LAYER_GAP,
        nodeGap: NODE_GAP,
        maxLayerWidth: MAX_LAYER_WIDTH,
        groupTitleGap: GROUP_FRAME_TITLE_GAP,
      },
      measure: (nid) => {
        const krsNode = nodeMap.get(nid)!;
        return measureNode(krsNode, frameOwnerOf(krsNode.kind, nid), measureCtx);
      },
    });
    if (placed.widthBound) anyWidthBound = true;

    const localNodes = new Map<string, LayoutNode>();
    for (const [nid, box] of placed.placements) {
      const krsNode = nodeMap.get(nid)!;
      localNodes.set(
        nid,
        makeLayoutNode(krsNode, nid, {
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          annotations: effectiveAnnotations(krsNode),
          owner: frameOwnerOf(krsNode.kind, nid),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        }),
      );
    }
    const childMaxWidth = placed.childMaxWidth;
    const childMaxHeight = placed.childMaxHeight;

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
        groupBy,
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
      // Shape ports seat on the root view too (#2515): the resolver is
      // per-node and keyed by id, so the same one serves every system frame.
      // Without it #2452's outline anchoring stopped at the drill-down views.
      ports: portResolver(options),
    });

    // A gutter route runs outside the system's cards, so it can reach past the
    // container rect. Advance by the routed extent, not just the rect, or the
    // next system's cards would sit on top of this one's edges.
    //
    // The baseline stays `offsetX + width`, not `containerRect.x + width`: a
    // left side column (#1728) shifts the rect's own x leftwards, so measuring
    // from it would hand the next system less room than before and let the two
    // containers overlap.
    // A left gutter lane (#2610) runs *before* the system's left edge, into
    // the strip the previous system's routes may already use. Slide this
    // whole system right by that overhang so its routes start at `offsetX`:
    // routing is translation-invariant, and the next system is placed after
    // the routed extent below either way. Points can be shared between trunk
    // siblings, so each is moved once.
    let routedLeft = offsetX;
    for (const e of systemEdges) {
      for (const p of [e.fromPoint, ...(e.waypoints ?? []), e.toPoint]) {
        routedLeft = Math.min(routedLeft, p.x);
      }
    }
    if (routedLeft < offsetX) {
      const dx = offsetX - routedLeft;
      for (const node of localNodes.values()) node.x += dx;
      for (const c of [containerRect, ...allContainers.slice(frameStart)]) {
        c.x += dx;
        for (const piece of c.coverage ?? []) piece.x += dx;
      }
      const moved = new Set<{ x: number; y: number }>();
      for (const e of systemEdges) {
        for (const p of [e.fromPoint, ...(e.waypoints ?? []), e.toPoint]) {
          if (moved.has(p)) continue;
          moved.add(p);
          p.x += dx;
        }
      }
    }
    // The larger of the two bases: `offsetX + width` over-covers a rect whose
    // x a left side column (#1728) pulled leftwards, and `x + width` covers a
    // rect the slide above pushed further right than any route reaches.
    let routedRight = Math.max(offsetX, containerRect.x) + containerRect.width;
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
  /**
   * Identity unless *that system's* copy of `id` was folded into a stub. A known
   * system is answered from its own fold alone — a miss there means that system
   * did not fold this child, not that another system's stub will do.
   */
  const remapCrossEndpoint = (systemId: string | undefined, id: string): string =>
    (systemId !== undefined
      ? crossSystemRemap.get(nodePathIdentityKey([systemId, id]))
      : crossSystemRemapUnscoped.get(id)) ?? id;
  for (const edge of viewSlice.crossSystemEdges) {
    const fromId = remapCrossEndpoint(crossSystemSource.get(edge), edge.from);
    // The root canvas draws a system's direct children only, so the target is
    // anchored on `path[1]` of the path view extraction resolved (#2577). For
    // the two-segment `Sys.Svc` that is the same id the first-dot split gave;
    // for a deeper target it is the service the target lives inside.
    const targetPath = viewSlice.crossSystemTargets.get(edge.to) ?? edge.to.split(".");
    const toService = targetPath[1] ?? targetPath[0];
    // The target system is `targetPath[0]`, so the qualified key is on hand.
    const toServiceRemapped = remapCrossEndpoint(targetPath[0], toService);
    const retargeted = fromId !== edge.from || toServiceRemapped !== toService;
    const toField =
      toServiceRemapped !== toService ? `${targetPath[0]}.${toServiceRemapped}` : edge.to;
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

  // Canvas dimensions from the same helper the single-system path uses, so the
  // root view also folds node and edge-waypoint extents into the maximum
  // (#2513). Since #2363 gave this path the real routing chain, a gutter route
  // on the rightmost system reaches past its container rect; measuring
  // containers alone left it outside the viewBox and clipped it.
  const { width: totalWidth, height: totalHeight } = computeTotalDimensions(
    allContainers,
    allLayoutNodes,
    allEdges,
    displayMode,
  );

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
    widthBound: anyWidthBound,
    crossingMarks,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    degradedMemberships: allDegradedMemberships.length > 0 ? allDegradedMemberships : undefined,
  };
}
