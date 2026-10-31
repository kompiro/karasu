/**
 * The multi-system root view (#3440): every system laid out as its own frame,
 * side by side, with the cross-system edges drawn between them afterwards
 * (`cross-system-edges.ts`). Called from the single-system pipeline, which
 * hands it its measurement context.
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { displayGroupId } from "../types/ast.js";
import { collapseCategories } from "./category-collapse.js";
import type { GroupBand } from "./group-layout.js";
import { groupLabelsFor } from "./group-labels.js";
import { withChildAnchoredEdges } from "../view/anchored-edges.js";
import type { ViewSlice } from "../view/view-slice.js";
import { placeNodesInLayers } from "./layer-layout-logics.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import {
  CONTAINER_PADDING,
  CONTAINER_LABEL_HEIGHT,
  GHOST_MARGIN,
  getLayoutConstants,
} from "./layout-constants.js";
import { computeLayers } from "./layer-assignment.js";
import { placeExternalServicesOnSides } from "./external-columns.js";
import {
  centerRowsHorizontally,
  computeTotalDimensions,
  normalizeCoordinates,
  translateEdgePoints,
} from "./layout-geometry.js";
import { computeEdgePoints, portResolver, runRoutingChain } from "./layout-edges.js";
import {
  canvasLayoutHints,
  canvasMembershipFor,
  collapseAndAssignGroupLayers,
  containerLayoutHints,
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
import { nodePathIdentityKey, nodePathRefId } from "../parser/node-path.js";
import { edgeKey } from "../diff/view-diff.js";
import {
  createCrossSystemRemap,
  layoutCrossSystemEdges,
  recordSystemFolds,
} from "./cross-system-edges.js";
import type {
  LayoutNode,
  LayoutEdge,
  ContainerRect,
  LayoutResult,
  LayoutOptions,
} from "./layout-types.js";

/**
 * Lay out multiple systems side by side for root view.
 * All systems are rendered as full (non-ghost) nodes.
 */
export function layoutMultipleSystems(
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
  // Where each system's folds sent its children, for the cross-system edges
  // drawn after the loop (#1884, #2646).
  const crossSystemRemap = createCrossSystemRemap();
  // Expanded service of each spliced domain (#1921), for the per-frame paths.
  const expandedParentOf = new Map<string, string>();
  for (const frame of viewSlice.expandedFrames) {
    for (const memberId of frame.memberIds) expandedParentOf.set(memberId, frame.containerId);
  }
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
    // The frame's edge set, as extraction derived it for *this* system (#2756).
    // Every family reaches the frame this way — infra edges from `resource`,
    // implicit service edges, `delivers` — where re-deriving here from
    // `sys.edges` saw only what the model declared with an arrow, so a root view
    // with more than one system (and the `__unassigned__` root a system-less
    // model gets) drew disconnected boxes. ADR-2223 patched the child-anchored
    // family the same way, one stage too low; the fallback keeps that patch as
    // the answer for a hand-built slice that carries no `systemEdges`.
    const systemFrame = viewSlice.systemEdges?.get(sys.id);
    const systemRawEdges = systemFrame?.edges ?? withChildAnchoredEdges(sys);
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
    // A domain spliced into this frame by in-place expansion (#1921) sits
    // under its expanded service (#2917: `Shop.Api.Orders`, not `Shop.Orders`).
    // Expansion is primary-only, so another frame's child that happens to share
    // a spliced member's id keeps its own `Admin.Orders` path (#3126).
    const framePathOf = (nid: string): string[] => {
      const expandedParent = si === 0 ? expandedParentOf.get(nid) : undefined;
      return expandedParent !== undefined
        ? [...frameScope, expandedParent, nid]
        : [...frameScope, nid];
    };
    const frameHints = canvasLayoutHints(options, systemNodes, framePathOf);
    // Path-keyed owner lookups for this frame's real nodes (#2548), same
    // shape as `canvasOwnerOf` on the single-system path.
    const frameOwnerOf: OwnerResolver = (kind, nid) =>
      ownerOf(kind, nodePathRefId(framePathOf(nid)));
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
    // rewrites, so record this system's folded members → stub for the
    // re-anchor after the loop (#1884 for groups, #2646 for categories).
    recordSystemFolds(crossSystemRemap, sys, systemNodes, (id) =>
      groupRemap(sysCollapsedCat.remapEndpoint(id)),
    );

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
      layoutHints: frameHints,
      // `grid-columns` on this system governs how its direct children wrap.
      gridHint: containerLayoutHints(options, sys.id, [sys.id])?.gridColumns,
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
        return measureNode(krsNode, frameOwnerOf(krsNode.kind, nid), measureCtx, framePathOf(nid));
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
          // The frame scope plus the id (#2917): `[Shop, Api]` and `[Admin, Api]`
          // for two same-named services, which `data-node-id` alone cannot say;
          // the same path the owner lookup above resolves.
          path: framePathOf(nid),
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
      path: [sys.id],
    };
    allContainers.push(containerRect);

    // Offset local nodes into global coordinate space. The merged Map is keyed
    // by (system, id), not by the bare id: two systems may both declare `Api`,
    // and a bare key made the later system overwrite the earlier one's card
    // (#2917) — the same overwrite ADR-1884 stopped for collapse stubs. The
    // renderer keeps emitting the bare `LayoutNode.id` (no `nodeIdentity`), so
    // the scoped key is internal to this function's lookups.
    for (const [id, node] of localNodes) {
      node.x += offsetX + CONTAINER_PADDING / 2;
      node.y += offsetY + CONTAINER_LABEL_HEIGHT;
      allLayoutNodes.set(nodePathIdentityKey([sys.id, id]), node);
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
          // This system's nodes only: the helper narrows by bare `n.id`, so the
          // accumulated Map would let a previous system's same-named node
          // through (#2917).
          localNodes,
          allContainers,
          sysEdges,
          frameHints,
        );

    // Intra-system edges
    const systemEdges: LayoutEdge[] = [];
    for (const edge of workEdges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        // Endpoints resolve within this frame (#2917): `from` / `to` are bare
        // ids, and the merged Map is keyed by (system, id).
        const le = computeEdgePoints(edge, localNodes, layers, sideExternals);
        if (le) {
          // The constituents behind an aggregated implicit service edge, from
          // *this* frame's map (#2756). `computeLayoutEdges` does the same for
          // the single-system path; without it here the detail panel opens empty
          // on every line the root view newly draws. Reading a per-frame map
          // rather than the slice-wide one is what keeps two systems that both
          // aggregate an `Api`→`Store` pair from showing each other's rows.
          const domainEdges = systemFrame?.implicitEdgeDetails.get(
            `${edge.from}->${edge.to}#${edge.kind}`,
          );
          if (domainEdges) le.domainEdges = domainEdges;
          // Stamp the frame's own compare-mode state onto the edge, for the same
          // reason as the details above: `edgeKey` is not unique across
          // frames here, so the renderer cannot ask a shared keyed map which
          // system a line belongs to (#2756).
          const frameDiffState = systemFrame?.edgeDiffState?.get(edgeKey(edge));
          if (frameDiffState !== undefined) le.diffState = frameDiffState;
          // The endpoints' keys in the merged Map, the same keys the cards are
          // stored under below (#2934).
          le.fromKey = nodePathIdentityKey([sys.id, edge.from]);
          le.toKey = nodePathIdentityKey([sys.id, edge.to]);
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
      // Each system frame is its own canvas, but nothing reserves room in it
      // (no canvas-wide row ordinal, ADR-2598), so its channels are left as
      // they were.
      enclosure: undefined,
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
      translateEdgePoints(systemEdges, dx, 0);
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

    // Bundle this system's parallel edges by (from, to) within the system
    // (#2917). Bundling ran once over every system's edges before, so two
    // systems that both draw `Api -> Worker` were folded into one bundle.
    // Placed after the slide above so the nudge sees final coordinates, exactly
    // where the single run saw them.
    markParallelBundles(systemEdges, (nodeId) => localNodes.get(nodeId));
  }

  // Cross-system edges (#1884, #2646, #2917), after every frame is placed.
  allEdges.push(...layoutCrossSystemEdges(viewSlice, crossSystemRemap, allLayoutNodes));

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
  return {
    nodes: allLayoutNodes,
    edges: allEdges,
    containers: allContainers,
    width: totalWidth,
    height: totalHeight,
    widthBound: anyWidthBound,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    degradedMemberships: allDegradedMemberships.length > 0 ? allDegradedMemberships : undefined,
  };
}
