/**
 * Edge computation and routing orchestration for the layout pipelines
 * (#2512): regular + ghost edge assembly, initial anchor points, the shape
 * port resolver (#2422), and the shared routing candidate chain both
 * pipelines run (TPL-219).
 */
import type { KrsEdge } from "../types/ast.js";
import type { ViewSlice } from "../view/view-extract.js";
import { routeOrthogonalEdges } from "./edge-routing-channels.js";
import {
  routeGroupedEdges,
  aggregateGroupTrunks,
  distributeGutterLanes,
  fanOutGutterPorts,
  frameObstaclesFor,
} from "./edge-routing-groups.js";
import { distributePorts } from "./edge-routing-ports.js";
import { distributeChannelLanes } from "./edge-routing-lanes.js";
import { BBOX_PORT_FRAME, seatPortsOnOutline, type PortResolver } from "./port-frame.js";
import { degradedTabsZone } from "./degraded-tabs.js";
import { getShapePortFrame } from "../shapes/shape-registry.js";
import type { GroupBand } from "./group-layout.js";
import type { LayoutNode, LayoutEdge, ContainerRect, LayoutOptions, Rect } from "./layout-types.js";

export function computeLayoutEdges(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  layers: Map<string, number>,
  containers: ContainerRect[],
  allEdges: KrsEdge[],
  sideExternals: Map<string, "left" | "right"> | undefined,
  // Re-target a ghost edge's internal endpoint onto its group's collapse stub
  // when that member was folded away (#1874). The regular edges in `allEdges`
  // were already remapped by `collapseGroups`; the ghost-edge lists on the
  // ViewSlice still reference original member ids, so without this they miss in
  // `layoutNodes` and fall back to the main container border. The caller passes
  // the identity map outside group-by-team collapse, so the ghost loops are
  // unaffected when nothing folds.
  remapGhostEndpoint: (id: string) => string,
  // Boundary-frame boxes for in-place-expanded containers (#1921), so a
  // service-level edge whose endpoint was expanded anchors on the frame border
  // instead of dropping.
  expandedFrames?: Map<string, { x: number; y: number; width: number; height: number }>,
): LayoutEdge[] {
  const layoutEdges: LayoutEdge[] = [];

  // Regular edges
  for (const edge of allEdges) {
    const le = computeEdgePoints(edge, layoutNodes, layers, sideExternals, expandedFrames);
    if (!le) continue;
    const edgeKey = `${edge.from}->${edge.to}#${edge.kind}`;
    const domainEdges = viewSlice.implicitEdgeDetails.get(edgeKey);
    if (domainEdges) {
      le.domainEdges = domainEdges;
    }
    layoutEdges.push(le);
  }

  // Ghost system edges (outgoing).
  // NOTE: if two members of one collapsed group ever carried a ghost edge to the
  // same external target, remapping both `from` onto the shared stub would emit
  // two overlapping connectors. `collapseGroups` de-dupes its re-targeted edges
  // by (from,to,kind); this ghost path does not. It is unreachable today (view
  // extraction only puts container ids on the internal endpoint), so de-dup is
  // deferred rather than risk dropping legitimately parallel ghost edges here.
  for (const edge of viewSlice.ghostSystemEdges) {
    const toNode = layoutNodes.get(edge.to);
    if (!toNode) continue;

    const fromId = remapGhostEndpoint(edge.from);
    let fromPoint: { x: number; y: number };
    const fromNode = layoutNodes.get(fromId);
    if (fromNode) {
      fromPoint = {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      };
    } else {
      const mainContainer = containers.find((c) => !c.ghost);
      if (!mainContainer) continue;
      fromPoint = {
        x: mainContainer.x + mainContainer.width,
        y: mainContainer.y + mainContainer.height / 2,
      };
    }

    const toPoint = {
      x: toNode.x,
      y: toNode.y + toNode.height / 2,
    };
    layoutEdges.push({
      from: fromId,
      to: edge.to,
      label: edge.label,
      ...edgeDetailOf(edge),
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  // Caller ghost system edges (incoming)
  for (const edge of viewSlice.callerGhostSystemEdges) {
    const fromNode = layoutNodes.get(edge.from);
    if (!fromNode) continue;

    const toId = remapGhostEndpoint(edge.to);
    const toNode = layoutNodes.get(toId);
    let toPoint: { x: number; y: number };
    if (toNode) {
      toPoint = { x: toNode.x, y: toNode.y + toNode.height / 2 };
    } else {
      const mainContainer = containers.find((c) => !c.ghost);
      if (!mainContainer) continue;
      toPoint = {
        x: mainContainer.x,
        y: mainContainer.y + mainContainer.height / 2,
      };
    }

    layoutEdges.push({
      from: edge.from,
      to: toId,
      label: edge.label,
      ...edgeDetailOf(edge),
      fromPoint: {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      },
      toPoint,
      ghost: true,
    });
  }

  // Ghost user edges
  for (const edge of viewSlice.ghostUserEdges) {
    const containerId = viewSlice.containerNode ? viewSlice.containerNode.id : "";
    const from = remapGhostEndpoint(edge.from);
    const to = remapGhostEndpoint(edge.to);
    const mainContainer = containers.find((c) => !c.ghost);
    const ghostNode = layoutNodes.get(from === containerId ? to : from);
    if (!ghostNode || !mainContainer) continue;

    const fromPoint = {
      x: ghostNode.x + ghostNode.width,
      y: ghostNode.y + ghostNode.height / 2,
    };
    const toPoint = {
      x: mainContainer.x,
      y: ghostNode.y + ghostNode.height / 2,
    };

    layoutEdges.push({
      from,
      to,
      label: edge.label,
      ...edgeDetailOf(edge),
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  // Ghost domain edges. A team can `owns` a domain (docs/spec), so a collapsed
  // domain endpoint must re-anchor to its stub like the service ones (#1874).
  pushGhostEdges(viewSlice.ghostDomainEdges, layoutNodes, layoutEdges, remapGhostEndpoint);

  // Ghost entity edges (entity view). Endpoints are pre-normalized in
  // extractEntityView: the foreign endpoint is the qualified `DomainId.EntityId`
  // key (matching the ghost node), the local endpoint is the bare entity id.
  pushGhostEdges(viewSlice.ghostEntityEdges, layoutNodes, layoutEdges, remapGhostEndpoint);

  return layoutEdges;
}

/**
 * Append muted (top/bottom-anchored) ghost edges to `layoutEdges`. Shared by the
 * ghost-domain and ghost-entity edge lists; both are laid out identically (a
 * short vertical connector between the main content and the ghost row below).
 * Endpoints missing from `layoutNodes` are skipped.
 */
/**
 * The edge property block's payload, spread onto a LayoutEdge (#2543, #2544).
 * Ghost renderings reduce an edge (they drop `canonicalId`, `kind`, `tags`),
 * but the prose and the facet membership are the *content* of the edge rather
 * than its addressing, and on a cross-service service view the ghost form is
 * the only place that edge is drawn — dropping either there would make the
 * accepted vocabulary invisible on exactly the view it was written for
 * (TPL-1503).
 */
function edgeDetailOf(edge: KrsEdge): Pick<LayoutEdge, "description" | "links" | "facets"> {
  return {
    ...(edge.description !== undefined ? { description: edge.description } : {}),
    ...(edge.links !== undefined && edge.links.length > 0 ? { links: edge.links } : {}),
    ...(edge.facets !== undefined && edge.facets.length > 0 ? { facets: edge.facets } : {}),
  };
}

function pushGhostEdges(
  edges: KrsEdge[],
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  remapGhostEndpoint: (id: string) => string,
): void {
  for (const edge of edges) {
    const from = remapGhostEndpoint(edge.from);
    const to = remapGhostEndpoint(edge.to);
    const fromNode = layoutNodes.get(from);
    const toNode = layoutNodes.get(to);
    if (!fromNode || !toNode) continue;

    const fromIsAbove = fromNode.y + fromNode.height / 2 < toNode.y + toNode.height / 2;
    layoutEdges.push({
      from,
      to,
      label: edge.label,
      ...edgeDetailOf(edge),
      fromPoint: {
        x: fromNode.x + fromNode.width / 2,
        y: fromIsAbove ? fromNode.y + fromNode.height : fromNode.y,
      },
      toPoint: {
        x: toNode.x + toNode.width / 2,
        y: fromIsAbove ? toNode.y : toNode.y + toNode.height,
      },
      ghost: true,
    });
  }
}

/**
 * Resolves what each node's outline offers an edge (#2422): the shape's port
 * frame, plus the keep-outs its own chrome claims — the corner lane of #2420
 * and the 縮退 tab row of #2179.
 *
 * Returns undefined without a `shapeForNode` hook, and in icon mode, for the
 * same reason the content insets stand down there: the card being drawn is a
 * plain frame, so the bounding box *is* the outline and every existing
 * diagram keeps its geometry.
 */
export function portResolver(options: LayoutOptions): PortResolver | undefined {
  const { shapeForNode, chipZoneFor, displayMode } = options;
  if (!shapeForNode || displayMode === "icon") return undefined;
  return (node) => {
    // `LayoutNode.annotations` already carries the effective (inherited) set —
    // the same value `measureNode` resolved the shape from.
    const shapeName = shapeForNode(node.id, node.annotations ?? []);
    const frameFn = shapeName ? getShapePortFrame(shapeName) : undefined;
    // A zero-area zone — a card with no chip and no buttons still reports its
    // empty lane — blocks nothing, and dropping it here is what lets the
    // single-anchor shortcut in `distributePorts` stay reachable.
    const keepOuts = [chipZoneFor?.(node), degradedTabsZone(node)].filter(
      (r): r is Rect => !!r && r.width > 0 && r.height > 0,
    );
    if (!frameFn && keepOuts.length === 0) return undefined;
    return { frame: frameFn?.(node.width, node.height) ?? BBOX_PORT_FRAME, keepOuts };
  };
}

export function computeEdgePoints(
  edge: KrsEdge,
  layoutNodes: Map<string, LayoutNode>,
  layers: Map<string, number>,
  sideExternals?: Map<string, "left" | "right">,
  /**
   * Boundary-frame boxes for containers expanded in place (#1921), keyed by the
   * expanded service id. An edge authored at the service level whose endpoint is
   * an expanded container has no node to anchor to (the service was replaced by
   * its domain children), so it anchors on the frame border here instead of
   * being silently dropped — mirroring the ghost-edge container fallback.
   */
  expandedFrames?: Map<string, { x: number; y: number; width: number; height: number }>,
): LayoutEdge | null {
  const fromNode = layoutNodes.get(edge.from) ?? expandedFrames?.get(edge.from);
  const toNode = layoutNodes.get(edge.to) ?? expandedFrames?.get(edge.to);
  if (!fromNode || !toNode) return null;

  const fromPoint = {
    x: fromNode.x + fromNode.width / 2,
    y: fromNode.y + fromNode.height,
  };
  const toPoint = {
    x: toNode.x + toNode.width / 2,
    y: toNode.y,
  };

  // Side-placed external endpoints (#1728): anchor on the external's *inner*
  // side so the connector runs horizontally and the arrowhead points inward —
  // a left-side external is entered from its right edge, a right-side external
  // from its left edge. The opposite endpoint anchors on the side that faces
  // the external. This overrides the layer-based vertical anchoring below
  // (external is still on a deeper tier index, which would otherwise pick a
  // top/bottom anchor).
  const toSide = sideExternals?.get(edge.to);
  const fromSide = sideExternals?.get(edge.from);
  if (toSide || fromSide) {
    // Set horizontal inner-side anchors and fall through to the shared return
    // below so any future LayoutEdge field is picked up in one place.
    if (toSide === "left") {
      toPoint.x = toNode.x + toNode.width;
      fromPoint.x = fromNode.x;
    } else if (toSide === "right") {
      toPoint.x = toNode.x;
      fromPoint.x = fromNode.x + fromNode.width;
    } else if (fromSide === "left") {
      fromPoint.x = fromNode.x + fromNode.width;
      toPoint.x = toNode.x;
    } else if (fromSide === "right") {
      fromPoint.x = fromNode.x;
      toPoint.x = toNode.x + toNode.width;
    }
    toPoint.y = toNode.y + toNode.height / 2;
    fromPoint.y = fromNode.y + fromNode.height / 2;
    // Skip layer-based adjustments below.
  } else {
    const fromLayer = layers.get(edge.from) ?? 0;
    const toLayer = layers.get(edge.to) ?? 0;
    if (fromLayer === toLayer) {
      // Same layer: horizontal edge
      if (fromNode.x < toNode.x) {
        fromPoint.x = fromNode.x + fromNode.width;
        fromPoint.y = fromNode.y + fromNode.height / 2;
        toPoint.x = toNode.x;
        toPoint.y = toNode.y + toNode.height / 2;
      } else {
        fromPoint.x = fromNode.x;
        fromPoint.y = fromNode.y + fromNode.height / 2;
        toPoint.x = toNode.x + toNode.width;
        toPoint.y = toNode.y + toNode.height / 2;
      }
    } else if (fromLayer > toLayer) {
      // Reverse edge
      fromPoint.y = fromNode.y;
      toPoint.y = toNode.y + toNode.height;
    }
  } // end of else branch (layer-based adjustments)

  return {
    from: edge.from,
    to: edge.to,
    label: edge.label,
    kind: edge.kind,
    fromPoint,
    toPoint,
    cyclic: edge.cyclic,
    ...(edge.canonicalId !== undefined ? { canonicalId: edge.canonicalId } : {}),
    ...(edge.syntheticLabel ? { syntheticLabel: true } : {}),
    ...edgeDetailOf(edge),
  };
}

/**
 * The shared routing candidate chain (#2362, ADR-1859 AC-5 superseded), run by
 * the single-system pipeline and, per system frame, by the multi-system root
 * (#2363). One function so the two paths cannot drift on pass order or
 * arguments (TPL-219). The grouping axis (none / team / boundary) and routing
 * capability are independent axes, so instead of forking on the band stack
 * both routers run, in priority order, in every mode:
 *
 *   straight (left alone when already clear)
 *     → interior channel-L  (edge-routing-channels.ts, ADR-968)
 *     → side gutter / mixed (edge-routing-groups.ts, #1859 P2c-A + #1954)
 *
 * Each pass skips an edge that a previous one routed (`waypoints` set) or that
 * needs no routing, so the chain is "cheapest clear candidate wins". The
 * grouped passes degrade to node-cards-only when `groupFrames` is empty, which
 * is what lets an ungrouped canvas gain gutter routing without a second
 * implementation. The ungrouped result is held by the TPL-1927 dual metric
 * (`routing-parity.test.ts`) instead of by the old byte-identity gate.
 */
export function runRoutingChain(
  nodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  groupFrames: ContainerRect[],
  // Every capability is a *required* field: a pipeline that lacks one states
  // `undefined` at its call site (self-documenting, greppable), and adding a
  // capability produces a compile error at every caller until each pipeline
  // states its answer — the drift class this chain exists to close (TPL-219).
  opts: {
    /**
     * Boundary-frame rects of containers expanded in place (#1921/#1923),
     * keyed by expanded service id. Single-system path only today.
     */
    expandedFrames: Map<string, ContainerRect> | undefined;
    /**
     * The Group-by band stack, or null when ungrouped — gates trunk
     * aggregation (#1859 P2c-B, rejected for ungrouped canvases in #2364) and
     * `groupBackward` dashing. Taken as the stack rather than a boolean so
     * the meaning of "grouped" lives here, not at each call site.
     */
    groupBands: Map<string, GroupBand> | null;
    /**
     * Shape port frames + chrome keep-outs (#2420/#2422). When absent,
     * `distributePorts` runs port-less and no outline seating happens — the
     * multi-system path passes none today (#2515).
     */
    ports: PortResolver | undefined;
  },
): void {
  const { expandedFrames, ports } = opts;
  const grouped = opts.groupBands !== null;
  // Distribute ports across each node side that hosts ≥ 2 edges, so labels
  // separate horizontally / vertically instead of stacking, and put every
  // port on the shape's drawn outline rather than its bounding box (#2422).
  // Must run before channel routing so the orthogonal pass uses the new
  // ports. See ADR-968 and Issue #996.
  distributePorts(nodes, edges, ports);
  // Candidate 1: interior channel-L. Frames become obstacles (per-endpoint
  // exemption) so the near route cannot be bent through a frame it is not in.
  routeOrthogonalEdges(nodes, edges, frameObstaclesFor(nodes, groupFrames, expandedFrames));
  // Candidate 2: side gutter, then mixed channel, for whatever is still
  // blocked. `groupBackward` dashing stays band-gated — "against the flow" is
  // only defined where there is a band stack.
  routeGroupedEdges(nodes, edges, groupFrames, expandedFrames, grouped);
  // Merge edges sharing an infra/external target onto one trunk lane per
  // target so distinct targets' spines no longer overlap (#1859 P2c-B).
  // Grouped only: trunk lanes live in the right gutter, so on an ungrouped
  // canvas they pull fan-in edges back out to the canvas edge and undo the
  // interior corridors (#2365) those edges would otherwise take. Measured and
  // rejected in #2364.
  if (grouped) {
    aggregateGroupTrunks(nodes, edges, groupFrames, expandedFrames);
  }
  // Give the remaining non-trunked gutter corridors distinct lanes so two
  // single-incoming edges no longer share a collinear vertical segment
  // (#1927), and fan out the anchors of edges leaving *or entering* one
  // node/frame on the same side. Both are waypoint-driven, so every route
  // shape the chain can produce takes part in the overlap passes (TPL-1954)
  // in both modes.
  distributeGutterLanes(nodes, edges, groupFrames);
  fanOutGutterPorts(nodes, edges, groupFrames, expandedFrames, ports);
  // Stagger the horizontal runs that share an inter-row channel across
  // distinct lanes at a fixed pitch (#2608). Keyed on the channel rather than
  // on the route shape, so every route's runs take part (TPL-1954); the room
  // the lanes need is reserved by `layout()`'s second placement pass. Frames
  // bound a channel the same way cards do, so a lane never lands in the
  // padding of a frame the edge is not in.
  const laneObstacles = [...new Set([...groupFrames, ...(expandedFrames?.values() ?? [])])].flatMap(
    (f) => f.coverage ?? [f],
  );
  distributeChannelLanes(nodes, edges, laneObstacles);
  // Seat every endpoint on the shape's drawn outline, now that the chain has
  // settled which route each edge takes (#2422). The candidate passes
  // re-anchor what they reroute, so this is where the guarantee is finally
  // made — moving inward always, and along the side only when the polyline
  // stays clear.
  if (ports) {
    const frameObstacles = frameObstaclesFor(nodes, groupFrames, expandedFrames);
    seatPortsOnOutline(nodes, edges, ports, (edge) => [
      // The same obstacle set the chain checks against: every card but the
      // two this edge terminates on, plus the frames it does not belong to.
      ...[...nodes.values()].filter((n) => n.id !== edge.from && n.id !== edge.to),
      ...frameObstacles(edge),
    ]);
  }
}
