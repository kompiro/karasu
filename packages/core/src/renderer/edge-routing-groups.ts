/**
 * Group-aware orthogonal routing for the system-view "Group by" mode
 * (Issue #1859, P2c slice A; design `docs/design/system-view-grouping.md`
 * § "P2c 実装設計"). Runs *instead of* `routeOrthogonalEdges` when the viewer
 * has Group by: team active, so the ungrouped pipeline stays byte-identical
 * (AC-5).
 *
 * The two-level grouped layout (P2a) stacks each team as a boundary-framed row
 * band. A straight service→infra edge then pierces every intermediate team
 * frame and card between its endpoints (measured: 11 penetrations on the
 * canonical 2-team fixture). The default skip-layer router
 * (`edge-routing-channels.ts`) only treats *node cards* as obstacles, not the
 * frames, so it cannot fix this.
 *
 * This pass adds the group frames to the obstacle set and, for any edge whose
 * straight path crosses a non-endpoint node or frame, reroutes it orthogonally
 * through a **side gutter** — a vertical corridor outside every frame, which is
 * clear of all obstacles by construction:
 *
 *   sourcePort(side) → (gutterX, sourceY) → (gutterX, targetY) → targetPort(side)
 *
 * The candidate route is verified segment-by-segment against the obstacle set
 * on both gutters, and the side is **chosen by capacity** (#2610): each clear
 * candidate is priced by its length on the lane the side's occupancy predicts
 * for it, and the cheaper side wins, the right on a tie. The gutter used to be
 * a constant — right first, then left — so everything that could not take an
 * interior corridor piled up on the right (204 of 460 waypoints in the right
 * half of dify's `Knowledge` view, 58 beyond 85% of the width). When a plain
 * side stub is blocked on *both* gutters — the endpoint's row has a sibling
 * between it and the gutter (a flanked infra target, or an actor whose row
 * blocks the exit, #1954) — the edge falls back to a **mixed route**
 * (`planMixedRoute`): keep the side stub on whichever endpoint is clear and
 * detour only the blocked endpoint out through its adjacent inter-row channel
 * via a top/bottom port. This completes the
 * "inter-band channel" leg the P2c-A design specified but never shipped (the same
 * clear-band detour the ungrouped router uses, ADR-968). Only if nothing
 * is clear is the edge left straight — strictly monotonic, never worse (AC-1).
 *
 * An edge that runs *against* the top-to-bottom group flow (target band above
 * source band) is flagged `groupBackward` so the renderer can dash it (AC-4).
 *
 * Ghost / cyclic edges are skipped, mirroring the skip-layer router — their
 * back-arc styling and ghost-anchor logic are handled elsewhere.
 *
 * Determinism: every coordinate is derived from node/frame geometry; no random
 * or DOM input, so snapshots stay stable.
 */
import type { LayoutEdge, LayoutNode, ContainerRect } from "./layout-types.js";
import { type Point, type Rect, segmentCrossesAnyRect, polylineClearOf } from "./edge-geometry.js";
import { attachableSpans, BBOX_PORT_FRAME, mapToSpans, type PortResolver } from "./port-frame.js";

/**
 * A routable endpoint box — a laid-out node card or an in-place-expanded
 * container's boundary frame (#1923). Both carry the geometry the router needs,
 * so a service-level edge whose endpoint is an expanded container can anchor on
 * the frame border and be gutter-routed like any other edge.
 */
type EdgeBox = { id: string; x: number; y: number; width: number; height: number };

/**
 * Resolve edge endpoints to boxes and containing frames, treating each in-place-
 * expanded container (#1923) as its own box (the frame) that belongs to its own
 * frame. Shared by all group-routing passes so a service-level edge whose
 * endpoint is an expanded container is handled the same everywhere — routed,
 * lane-separated, fanned out, and trunked — not just by `routeGroupedEdges`.
 */
function resolveGroupBoxes(
  layoutNodes: Map<string, LayoutNode>,
  frames: ContainerRect[],
  expandedFrames?: Map<string, ContainerRect>,
): { boxOf: (id: string) => EdgeBox | undefined; framesOfNode: Map<string, Set<string>> } {
  const boxOf = (id: string): EdgeBox | undefined => layoutNodes.get(id) ?? expandedFrames?.get(id);
  const framesOfNode = buildFramesOfNode(layoutNodes, frames);
  if (expandedFrames) {
    for (const [cid, rect] of expandedFrames) framesOfNode.set(cid, new Set([rect.id]));
  }
  return { boxOf, framesOfNode };
}

/** Horizontal gap between the outermost frame/node edge and a routing gutter. */
const GUTTER_GAP = 28;
/**
 * Horizontal spacing between distinct aggregation-trunk lanes (P2c-B), and the
 * pitch at which interior corridors share one gap between two cards (#2611).
 * One constant for both because the column reservation in `layout()` has to
 * size a gap in the same unit the router hands lanes out in — a reservation
 * measured in a different pitch than the pass that consumes it buys either
 * nothing or too much (the ADR-2598 lesson, on the horizontal axis).
 */
export const TRUNK_LANE_GAP = 24;

interface Gutter {
  x: number;
  /** Which node side the stubs attach to when using this gutter. */
  side: "left" | "right";
}

/**
 * Obstacles an edge must not cross: every other node card, plus every group
 * frame that encloses neither endpoint (an edge legitimately starts and ends
 * inside its own team frame).
 *
 * The exemption is per *endpoint*, which is also what redefines penetration for
 * the regions where two boundary frames overlap (#2179): an edge between two
 * members of the same boundary is exempt from that boundary's frame everywhere,
 * including the widened part, so running through an overlap is not a
 * penetration. A frame neither endpoint belongs to still blocks the whole of it.
 */
function obstaclesFor(
  edge: LayoutEdge,
  nodes: LayoutNode[],
  frames: ContainerRect[],
  framesOfNode: Map<string, Set<string>>,
): Rect[] {
  const fFrom = framesOfNode.get(edge.from);
  const fTo = framesOfNode.get(edge.to);
  return [
    ...nodes.filter((n) => n.id !== edge.from && n.id !== edge.to),
    ...frames.filter((f) => !fFrom?.has(f.id) && !fTo?.has(f.id)).flatMap((f) => framePieces(f)),
  ];
}

/** Right-side anchor point (mid-height) of a node. */
function rightPort(n: EdgeBox): Point {
  return { x: n.x + n.width, y: n.y + n.height / 2 };
}

/**
 * Deterministic, locale-independent edge order by author id (`from` then `to`).
 * Used as the stable tie-break wherever gutter edges are sorted, so snapshots
 * don't depend on `Array.sort` stability or the host locale.
 */
function cmpEdgeId(a: LayoutEdge, b: LayoutEdge): number {
  return a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
}

/**
 * Content bounds (leftmost / rightmost x over every card and frame). The gutter
 * and trunk/single lane x's are all derived from these, so the three routing
 * passes MUST agree on the basis for their lane numbering to align — hence one
 * shared helper rather than three inline copies.
 */
function contentBounds(
  nodes: LayoutNode[],
  frames: ContainerRect[],
): { minLeft: number; maxRight: number } {
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const n of nodes) {
    minLeft = Math.min(minLeft, n.x);
    maxRight = Math.max(maxRight, n.x + n.width);
  }
  // Coverage, not the recorded rect: a widened frame's strip can reach past the
  // band body's x range, and a gutter placed inside it would not be clear.
  for (const f of frames) {
    for (const p of framePieces(f)) {
      minLeft = Math.min(minLeft, p.x);
      maxRight = Math.max(maxRight, p.x + p.width);
    }
  }
  return { minLeft, maxRight };
}

/**
 * The frame obstacles an edge must not cross, with the same per-endpoint
 * exemption `obstaclesFor` applies — but without the node cards, which the
 * interior channel-L pass (`edge-routing-channels.ts`) already collects itself.
 * Supplied to that pass so the first candidate in the shared chain cannot bend
 * an edge straight through a frame it does not belong to (#2362).
 *
 * Returns an empty set on an ungrouped canvas, which is exactly what makes the
 * shared chain degrade to the ADR-968 behaviour there.
 */
export function frameObstaclesFor(
  layoutNodes: Map<string, LayoutNode>,
  frames: ContainerRect[],
  expandedFrames?: Map<string, ContainerRect>,
): (edge: LayoutEdge) => Rect[] {
  if (frames.length === 0) return () => [];
  const { framesOfNode } = resolveGroupBoxes(layoutNodes, frames, expandedFrames);
  return (edge) => {
    const fFrom = framesOfNode.get(edge.from);
    const fTo = framesOfNode.get(edge.to);
    return frames
      .filter((f) => !fFrom?.has(f.id) && !fTo?.has(f.id))
      .flatMap((f) => framePieces(f));
  };
}

export function routeGroupedEdges(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
  /**
   * In-place-expanded container frames keyed by container id (#1923). Lets an
   * edge whose endpoint is an expanded service anchor on the frame border and
   * route around the *other* frames — the same way a node endpoint enters its
   * own frame. Omitted for Group-by team (no frame endpoints there).
   */
  expandedFrames?: Map<string, ContainerRect>,
  /**
   * Whether an against-flow edge is flagged for dashing. "Backward" is defined
   * by the band stack, so it is meaningless without one — the shared chain
   * passes `false` on an ungrouped canvas (#2362).
   */
  markBackward = true,
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;
  const { boxOf, framesOfNode } = resolveGroupBoxes(layoutNodes, frames, expandedFrames);

  // Content bounds → gutter x on each side, outside every frame and card.
  const { minLeft, maxRight } = contentBounds(nodes, frames);
  const rightGutter: Gutter = { x: maxRight + GUTTER_GAP, side: "right" };
  const leftGutter: Gutter = { x: minLeft - GUTTER_GAP, side: "left" };
  // Corridors handed out so far on each side (#2610). The ones a candidate
  // overlaps are the lanes `distributeGutterLanes` will have to put it beyond,
  // which is what prices the side.
  const occupancy: Record<Gutter["side"], YRange[]> = { left: [], right: [] };
  // Vertical corridors *between* columns, tried before the outer gutters (#2365).
  //
  // Ungrouped canvases only. P2c's side gutter is penetration-safe *by
  // construction* — every lane x lies beyond the content, where no card or frame
  // exists — and `distributeGutterLanes` inherits that assumption when it widens
  // a corridor into a free lane. An interior corridor has neither property: it is
  // safe only because each route is verified, and it cannot be shifted sideways
  // without re-checking. Rather than weaken the grouped guarantee, interior
  // corridors are offered only where there are no frames, which is exactly where
  // the long detours were observed.
  const innerCorridors = frames.length === 0 ? corridorCandidates(nodes) : [];
  // Corridors already taken, so two edges never lay collinear verticals on one
  // interior lane. `distributeGutterLanes` cannot fix this after the fact (it only
  // relocates corridors outside the content), so the collision is avoided here at
  // routing time — the interior equivalent of lane separation (TPL-1954).
  const claimed: ClaimedSegment[] = [];
  // The inter-row channels a claimed vertical may later be dragged across
  // (#2611); see `verticalClaim`.
  const bands = channelBandsOf(nodes);

  // What is already on the canvas occupies its columns too (#2611). The first
  // candidate in the chain (the interior channel-L, ADR-968) has routed some
  // edges before this pass runs, and an edge whose straight line is clear
  // keeps the ports `distributePorts` gave it. Neither goes through the
  // arbitration below, so unless their segments are claimed up front, an
  // interior corridor can be laid straight on top of one — which is what the
  // measurements showed. Claiming them keys the arbitration on the resource
  // rather than on which pass produced the route (TPL-1954).
  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    if (!edge.waypoints || edge.waypoints.length === 0) continue;
    const from = boxOf(edge.from);
    const to = boxOf(edge.to);
    if (!from || !to) continue;
    claimed.push(
      ...claimedSegmentsOf([edge.fromPoint, ...edge.waypoints, edge.toPoint], from, to, bands),
    );
  }

  // Canonical order (#2610): by the endpoints' geometry, then by id. Corridors
  // and gutter lanes are handed out greedily, so the order decides who gets
  // what; keyed on geometry it does not depend on where in the file an edge
  // was declared.
  const ordered = [...layoutEdges].sort((a, b) => cmpEdgeGeometry(a, b, boxOf));

  for (const edge of ordered) {
    if (edge.ghost || edge.cyclic) continue;
    if (edge.waypoints && edge.waypoints.length > 0) continue;

    const from = boxOf(edge.from);
    const to = boxOf(edge.to);
    if (!from || !to) continue;

    // Against-flow (target band above source) → dash it. Independent of whether
    // the edge needs rerouting; a clear backward edge is still dashed.
    if (markBackward && to.y + to.height <= from.y) edge.groupBackward = true;

    const obstacles = obstaclesFor(edge, nodes, frames, framesOfNode);

    // Leave clear edges (adjacent, intra-band) exactly as the shared pipeline
    // placed them — keeps simple edges simple and snapshots minimal. Their
    // segment is claimed all the same: a straight drop from a card's bottom
    // port is a column like any other, and a corridor laid on it would draw
    // one line where the diagram means two.
    if (!segmentCrossesAnyRect(edge.fromPoint, edge.toPoint, obstacles)) {
      claimed.push(...claimedSegmentsOf([edge.fromPoint, edge.toPoint], from, to, bands));
      continue;
    }

    // Nearest clear corridor first: a vertical gap *between* columns beats
    // running out to the canvas edge, which is what made a detour stretch the
    // whole width of the diagram (#2365). Corridors are ordered by distance from
    // the midpoint between the endpoints, so the shortest usable one wins; when
    // none is clear the outer gutters below still catch the edge, so this only
    // ever shortens a route it would otherwise have taken.
    //
    // Two candidates equidistant from the midpoint sit on opposite sides of it,
    // and the tie used to fall to whichever node was visited first — so an edge
    // could leave its source *away* from its target and swing back across it,
    // crossing its own siblings for no gain (#2611). The target's column
    // settles it: of two equally near corridors, the one nearer the target is
    // the one the route was heading for anyway. `x` last, so the order never
    // depends on map iteration.
    const mid = midX(from, to);
    const toCentre = to.x + to.width / 2;
    const routedInner = innerCorridors
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a - mid) - Math.abs(b - mid) ||
          Math.abs(a - toCentre) - Math.abs(b - toCentre) ||
          a - b,
      )
      .slice(0, MAX_CORRIDOR_TRIES)
      .some((x) => tryCorridorRoute(edge, from, to, x, obstacles, nodes, claimed, bands));
    if (routedInner) continue;
    // A **staircase**: through one gap of every row between the endpoints,
    // shifting x in the inter-row channels in between (#2611). This is the
    // route shape a Sugiyama dummy chain produces, reached without dummy
    // nodes — the reason the chain is not worth its cost here is recorded in
    // the ADR: karasu's in-layer order is fixed by kind tier and declaration,
    // so dummies would take no part in ordering, and only their *space*
    // matters. A long edge whose own row's gaps are all blocked still falls
    // through to the gutters below (never worse, ADR-968).
    if (frames.length === 0 && tryStaircaseRoute(edge, from, to, obstacles, nodes, claimed, bands))
      continue;

    // A plain side route (the 2-waypoint route) on whichever gutter is
    // cheaper; only when neither gutter clears one, a **mixed route**: keep
    // the side stub on whichever endpoint is clear and detour only the blocked
    // endpoint through its adjacent inter-row channel (a top/bottom port). If
    // nothing is clear the edge stays straight (never worse).
    const pick =
      cheapestSide(
        [rightGutter, leftGutter].map((g) => ({
          gutter: g,
          path: planGutterRoute(from, to, g, obstacles),
        })),
        occupancy,
      ) ??
      cheapestSide(
        [rightGutter, leftGutter].map((g) => ({
          gutter: g,
          path: planMixedRoute(from, to, g, obstacles, nodes, claimed, bands),
        })),
        occupancy,
      );
    if (!pick) continue;
    applyPath(edge, pick.path);
    occupancy[pick.gutter.side].push(pick.corridor);
  }
}

/** A vertical extent, as the lane passes see a corridor. */
interface YRange {
  lo: number;
  hi: number;
}

/**
 * Pick the cheaper of two gutter candidates (#2610). A candidate's price is
 * the length of its route once the corridor sits on the lane its side's
 * occupancy predicts — every corridor already there that overlaps it in y
 * pushes it one `TRUNK_LANE_GAP` further out, and both stubs grow with it.
 * The right gutter wins a tie, which is the order this pass had before
 * capacity entered into it, so a canvas with room on both sides routes as it
 * did. Null when neither candidate is clear.
 */
function cheapestSide(
  candidates: { gutter: Gutter; path: Point[] | null }[],
  occupancy: Record<Gutter["side"], YRange[]>,
): { gutter: Gutter; path: Point[]; corridor: YRange } | null {
  let best: { gutter: Gutter; path: Point[]; corridor: YRange; cost: number } | null = null;
  for (const { gutter, path } of candidates) {
    if (!path) continue;
    const corridor = corridorOfPath(path);
    if (!corridor) continue;
    const lanes = occupancy[gutter.side].filter(
      (r) => Math.min(r.hi, corridor.hi) - Math.max(r.lo, corridor.lo) > 1e-6,
    ).length;
    const cost = pathLength(path) + 2 * lanes * TRUNK_LANE_GAP;
    if (best === null || cost < best.cost - 1e-9) best = { gutter, path, corridor, cost };
  }
  return best;
}

/**
 * The vertical corridor of a planned route: its interior pair sharing an x. A
 * zero-height pair (endpoints at one mid-height) is still the corridor — the
 * lane passes treat it as a point, and the route is as clear as any other.
 */
function corridorOfPath(path: Point[]): YRange | null {
  for (let i = 1; i < path.length - 2; i++) {
    if (path[i].x === path[i + 1].x) {
      return { lo: Math.min(path[i].y, path[i + 1].y), hi: Math.max(path[i].y, path[i + 1].y) };
    }
  }
  return null;
}

/** Manhattan length of an orthogonal polyline. */
function pathLength(path: Point[]): number {
  let length = 0;
  for (let i = 0; i < path.length - 1; i++) {
    length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
  }
  return length;
}

/** Write a planned route onto the edge: ports at the ends, bends in between. */
function applyPath(edge: LayoutEdge, path: Point[]): void {
  edge.fromPoint = path[0];
  edge.toPoint = path[path.length - 1];
  edge.waypoints = path.slice(1, -1);
}

/**
 * Order edges by where they are, not by where they were written (#2610):
 * top-most endpoint first, then the other endpoint, then x, then ids. Edges
 * whose boxes are missing sort last and are skipped by the caller anyway.
 */
function cmpEdgeGeometry(
  a: LayoutEdge,
  b: LayoutEdge,
  boxOf: (id: string) => EdgeBox | undefined,
): number {
  const key = (e: LayoutEdge): number[] => {
    const from = boxOf(e.from);
    const to = boxOf(e.to);
    if (!from || !to) return [Infinity];
    return [
      Math.min(from.y, to.y),
      Math.max(from.y, to.y),
      Math.min(from.x, to.x),
      Math.max(from.x, to.x),
    ];
  };
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  const byId = cmpEdgeId(a, b);
  if (byId !== 0) return byId;
  // Parallel edges between one pair of boxes share every key above and the
  // ids; their kind (sync before async) settles the order.
  const kindA = a.kind ?? "";
  const kindB = b.kind ?? "";
  return kindA < kindB ? -1 : kindA > kindB ? 1 : 0;
}

/**
 * Mid-height side stub blocked on both gutters means the endpoint's row has a
 * sibling between it and the gutter. The empty band *adjacent* to an endpoint's
 * row (an inter-row channel, clear across the full layout width by construction)
 * lets that endpoint out via a **top/bottom port** instead — the same
 * inter-band channel the ungrouped router uses (ADR-968). These return
 * the clear-band y just below / above a box, from the nearest node in the next
 * row; with no neighbour they fall back to a `GUTTER_GAP` offset.
 */
function channelBelow(box: EdgeBox, nodes: LayoutNode[]): number {
  let nearestTop = Infinity;
  for (const n of nodes) {
    if (n.id === box.id) continue;
    if (n.y >= box.y + box.height - 1e-6) nearestTop = Math.min(nearestTop, n.y);
  }
  return nearestTop === Infinity
    ? box.y + box.height + GUTTER_GAP
    : (box.y + box.height + nearestTop) / 2;
}
function channelAbove(box: EdgeBox, nodes: LayoutNode[]): number {
  let nearestBottom = -Infinity;
  for (const n of nodes) {
    if (n.id === box.id) continue;
    const b = n.y + n.height;
    if (b <= box.y + 1e-6) nearestBottom = Math.max(nearestBottom, b);
  }
  return nearestBottom === -Infinity ? box.y - GUTTER_GAP : (nearestBottom + box.y) / 2;
}

/**
 * One end of a mixed route: either a **side** stub (mid-height port straight out
 * to the gutter) when that stub is clear, or a **channel** stub (top/bottom port
 * → adjacent inter-row channel → gutter) when the side stub is blocked. `port`
 * is the edge anchor, `elbows` are the extra bend(s) between the port and the
 * gutter corridor (empty for a side end), and `cy` is the y at which this end
 * meets the vertical gutter corridor.
 */
interface MixedEnd {
  port: Point;
  elbows: Point[];
  cy: number;
}

/**
 * Decide one endpoint's stub. `forward` is whether the target sits below the
 * source (so the source exits downward / the target enters from above).
 * `isSource` picks the exit vs entry channel band.
 */
function mixedEnd(
  box: EdgeBox,
  gutter: Gutter,
  obstacles: Rect[],
  nodes: LayoutNode[],
  forward: boolean,
  isSource: boolean,
  claimed: readonly ClaimedSegment[] = [],
  bands: readonly { top: number; bottom: number }[] = [],
): MixedEnd {
  const sideX = gutter.side === "right" ? box.x + box.width : box.x;
  const midY = box.y + box.height / 2;
  const sideClear = !segmentCrossesAnyRect(
    { x: sideX, y: midY },
    { x: gutter.x, y: midY },
    obstacles,
  );
  if (sideClear) return { port: { x: sideX, y: midY }, elbows: [], cy: midY };
  // Blocked → detour this end through the adjacent inter-row channel.
  const outward = isSource ? forward : !forward; // does this end leave/enter downward?
  const channelY = outward ? channelBelow(box, nodes) : channelAbove(box, nodes);
  const portY = outward ? box.y + box.height : box.y;
  // The stub drops from the card's centre unless a corridor already claimed
  // that x over the same band; then it steps sideways by whole lane pitches,
  // staying on the card so the port remains attachable (#2611). Without this,
  // a channel stub and an interior corridor that share a gap draw one line.
  const centre = box.x + box.width / 2;
  const lo = Math.min(portY, channelY);
  const hi = Math.max(portY, channelY);
  let cx = centre;
  for (const dx of [0, -TRUNK_LANE_GAP, TRUNK_LANE_GAP, -2 * TRUNK_LANE_GAP, 2 * TRUNK_LANE_GAP]) {
    const x = centre + dx;
    if (x <= box.x || x >= box.x + box.width) continue;
    if (!conflicts(claimed, verticalClaim(x, lo, hi, bands))) {
      cx = x;
      break;
    }
  }
  return { port: { x: cx, y: portY }, elbows: [{ x: cx, y: channelY }], cy: channelY };
}

/**
 * Plan a **mixed route**: a plain side stub on each clear endpoint, a
 * top/bottom channel stub on each blocked one, joined by one vertical gutter
 * corridor. Reduces to the 2-waypoint side route when both ends are clear (that
 * case is already taken by `planGutterRoute`, so this only fires when at least
 * one side stub is blocked). Verified whole against the obstacle set; returns
 * the polyline only if fully clear, so the caller never applies a worse route
 * (AC-1).
 */
function planMixedRoute(
  from: EdgeBox,
  to: EdgeBox,
  gutter: Gutter,
  obstacles: Rect[],
  nodes: LayoutNode[],
  claimed: readonly ClaimedSegment[] = [],
  bands: readonly { top: number; bottom: number }[] = [],
): Point[] | null {
  const forward = to.y >= from.y + from.height;
  const backward = from.y >= to.y + to.height;
  // Endpoints that overlap vertically have no clear inter-row channel between
  // them; leave such an edge straight (it rarely penetrates in a band layout).
  if (!forward && !backward) return null;

  const src = mixedEnd(from, gutter, obstacles, nodes, forward, true, claimed, bands);
  const tgt = mixedEnd(to, gutter, obstacles, nodes, forward, false, claimed, bands);
  const path: Point[] = [
    src.port,
    ...src.elbows,
    { x: gutter.x, y: src.cy },
    { x: gutter.x, y: tgt.cy },
    ...tgt.elbows,
    tgt.port,
  ];
  return polylineClearOf(path, obstacles) ? path : null;
}

/** Midpoint between two boxes' centres on the x axis — the yardstick for "nearest corridor". */
function midX(from: EdgeBox, to: EdgeBox): number {
  return (from.x + from.width / 2 + to.x + to.width / 2) / 2;
}

/**
 * Candidate x positions for a vertical corridor that runs *between* columns of
 * content rather than around the whole diagram (#2365).
 *
 * One candidate is offered just outside each card's left and right border. Rows
 * are centred independently and vary in width, so the union of all card x-ranges
 * usually spans the entire canvas — deriving candidates from gaps in that union
 * finds nothing on a real diagram. Offering a lane beside every card and letting
 * the existing whole-polyline verification reject the blocked ones finds the
 * lanes that actually exist over the rows an edge crosses.
 *
 * Candidates are only *proposals*: `tryCorridorRoute` still verifies the whole
 * route against the obstacle set, so a lane that is clear beside one row but
 * blocked two rows down simply fails and the edge falls through to the outer
 * gutters. On a grouped canvas the frames span the band width, so most of these
 * are blocked and the grouped view keeps its gutter routes unchanged.
 */
function corridorCandidates(nodes: LayoutNode[]): number[] {
  // Beside every card (as before) and at the midpoint of every gap between two
  // neighbouring cards of a row (#2611). A gap wide enough for a corridor is a
  // lane whether or not a card border happens to sit at its edge; before this,
  // a gap was only reachable through the ±half offsets of the cards flanking
  // it, which land off-centre and lose to the card-border candidates in the
  // nearest-first order. Two routes in one gap are kept apart by claiming every
  // segment of a route, not by thinning the candidates.
  const half = GUTTER_GAP / 2;
  const xs = new Set<number>();
  const rows = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    xs.add(n.x - half);
    xs.add(n.x + n.width + half);
    const key = Math.round(n.y * 2) / 2;
    const row = rows.get(key);
    if (row) row.push(n);
    else rows.set(key, [n]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < row.length; i++) {
      const left = row[i].x + row[i].width;
      const right = row[i + 1].x;
      if (right - left >= 2 * half) xs.add((left + right) / 2);
    }
  }
  return [...xs];
}

/**
 * How many corridor candidates one edge may try before falling through to the
 * outer gutters. Candidates are sorted nearest-first, so the cap only discards
 * lanes further away than the ones already rejected — and a route through a
 * distant lane is barely shorter than the gutter route it would replace.
 */
const MAX_CORRIDOR_TRIES = 8;

/**
 * Attempt a route through a vertical corridor at `corridorX`, with each endpoint
 * attaching on the side that faces it. Unlike {@link tryGutterRoute} the two
 * ports may take opposite sides, which is what makes a corridor *between* the
 * endpoints usable. An endpoint whose own box straddles the corridor has no
 * facing side, so that corridor is rejected for this edge.
 *
 * Applied only when the whole polyline is obstacle-free — never worse (AC-1).
 */
function tryCorridorRoute(
  edge: LayoutEdge,
  from: EdgeBox,
  to: EdgeBox,
  corridorX: number,
  obstacles: Rect[],
  nodes: LayoutNode[],
  claimed: ClaimedSegment[],
  bands: readonly { top: number; bottom: number }[],
): boolean {
  // Each end reaches the corridor the way a mixed gutter route reaches its
  // gutter (#2611): a side stub at mid-height when that is clear, otherwise a
  // top/bottom port and the adjacent inter-row channel. One sibling standing
  // between the card and the corridor used to reject the whole column even
  // when the column itself was free — measured as 243 of dify's 538
  // gutter-routed edges. The entry rule lives in `mixedEnd` for both, so it
  // cannot drift apart between gutter and corridor (TPL-219).
  const sideFor = (b: EdgeBox): Gutter["side"] | null =>
    corridorX >= b.x + b.width ? "right" : corridorX <= b.x ? "left" : null;
  const srcSide = sideFor(from);
  const tgtSide = sideFor(to);
  if (!srcSide || !tgtSide) return false;
  const forward = to.y >= from.y + from.height;
  const backward = from.y >= to.y + to.height;
  const src = corridorEnd(
    from,
    { x: corridorX, side: srcSide },
    obstacles,
    nodes,
    forward,
    backward,
    true,
    claimed,
    bands,
  );
  const tgt = corridorEnd(
    to,
    { x: corridorX, side: tgtSide },
    obstacles,
    nodes,
    forward,
    backward,
    false,
    claimed,
    bands,
  );
  if (!src || !tgt) return false;

  const path: Point[] = [
    src.port,
    ...src.elbows,
    { x: corridorX, y: src.cy },
    { x: corridorX, y: tgt.cy },
    ...tgt.elbows,
    tgt.port,
  ];
  // Every axis-aligned segment of the route is claimed — verticals as
  // corridors, horizontals as stubs — and a route is rejected when any of
  // its segments would lie collinear on a claimed one. Two edges may share a
  // gap only where their segments never coincide: a channel stub dropping
  // from a card's centre onto the gap below, or two mid-height stubs entering
  // one gap from opposite cards, are exactly the cases this arbitrates.
  const segments = claimedSegmentsOf(path, from, to, bands);
  if (segments.some((v) => conflicts(claimed, v))) return false;
  if (!polylineClearOf(path, obstacles)) return false;

  edge.fromPoint = path[0];
  edge.toPoint = path[path.length - 1];
  edge.waypoints = path.slice(1, -1);
  claimed.push(...segments);
  return true;
}

/**
 * Route an edge whose endpoints sit two or more rows
 * apart through one gap of every row in between: a vertical through the gap,
 * then a horizontal run in the channel below to the next row's gap, and so
 * on. The gap for each row is the one nearest the previous x (nearest the
 * ideal x — the midpoint of the endpoints — for the first), first free lane
 * wins. Exits and enters through the ports `distributePorts` gave the edge
 * (bottom of the source, top of the target, or mirrored for a reverse edge).
 * Every vertical is claimed; the channel runs are laned by the lane pass.
 */
function tryStaircaseRoute(
  edge: LayoutEdge,
  from: EdgeBox,
  to: EdgeBox,
  obstacles: Rect[],
  nodes: LayoutNode[],
  claimed: ClaimedSegment[],
  bands: readonly { top: number; bottom: number }[],
): boolean {
  const rows = rowsOf(nodes);
  const real = nodes.filter((n) => !n.ghost);
  const contentLeft = Math.min(...real.map((n) => n.x));
  const contentRight = Math.max(...real.map((n) => n.x + n.width));
  const rowIndex = (b: EdgeBox) => rows.findIndex((r) => Math.abs(r.y - b.y) < 0.5);
  const rf = rowIndex(from);
  const rt = rowIndex(to);
  if (rf === -1 || rt === -1 || Math.abs(rf - rt) < 2) return false;
  const down = rt > rf;
  const step = down ? 1 : -1;
  const half = GUTTER_GAP / 2;

  // Ports: the distributed bottom/top ports when the edge still has them,
  // else the card's centre on the facing side.
  const fromOnBottom = Math.abs(edge.fromPoint.y - (from.y + from.height)) < 0.5;
  const fromOnTop = Math.abs(edge.fromPoint.y - from.y) < 0.5;
  const toOnTop = Math.abs(edge.toPoint.y - to.y) < 0.5;
  const toOnBottom = Math.abs(edge.toPoint.y - (to.y + to.height)) < 0.5;
  const srcPort: Point = down
    ? fromOnBottom
      ? edge.fromPoint
      : { x: from.x + from.width / 2, y: from.y + from.height }
    : fromOnTop
      ? edge.fromPoint
      : { x: from.x + from.width / 2, y: from.y };
  const tgtPort: Point = down
    ? toOnTop
      ? edge.toPoint
      : { x: to.x + to.width / 2, y: to.y }
    : toOnBottom
      ? edge.toPoint
      : { x: to.x + to.width / 2, y: to.y + to.height };

  const ideal = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
  const channelBetween = (a: number, b: number) => {
    const upper = rows[Math.min(a, b)];
    const lower = rows[Math.max(a, b)];
    return (upper.bottom + lower.y) / 2;
  };

  const path: Point[] = [srcPort];
  let x = srcPort.x;
  let y = channelBetween(rf, rf + step);
  path.push({ x, y });
  for (let r = rf + step; r !== rt; r += step) {
    const row = rows[r];
    const above = channelBetween(r - step, r);
    const below = channelBetween(r, r + step);
    const lo = Math.min(above, below);
    const hi = Math.max(above, below);
    // Lanes inside each gap, nearest the current x first (ties toward the
    // ideal), plus lanes in the room beside the row's outer cards — a narrow
    // row in a wide canvas has most of its free space there.
    const lanes: number[] = [];
    for (const g of row.gaps) {
      const n = Math.max(1, Math.floor((g.right - g.left - 2 * half) / TRUNK_LANE_GAP) + 1);
      const centre = (g.left + g.right) / 2;
      for (let k = 0; k < n; k++) lanes.push(centre + (k - (n - 1) / 2) * TRUNK_LANE_GAP);
    }
    for (let gx = row.left - half; gx >= contentLeft + half; gx -= TRUNK_LANE_GAP) lanes.push(gx);
    for (let gx = row.right + half; gx <= contentRight - half; gx += TRUNK_LANE_GAP) lanes.push(gx);
    lanes.sort(
      (a, b) => Math.abs(a - x) - Math.abs(b - x) || Math.abs(a - ideal) - Math.abs(b - ideal),
    );
    const pick = lanes.find((gx) => !conflicts(claimed, verticalClaim(gx, lo, hi, bands)));
    if (pick === undefined) return false;
    if (pick !== x) path.push({ x: pick, y: above });
    path.push({ x: pick, y: below });
    x = pick;
    y = below;
  }
  if (x !== tgtPort.x) path.push({ x: tgtPort.x, y });
  path.push(tgtPort);

  // Collapse duplicate consecutive points a same-x step can produce.
  const cleaned = path.filter(
    (p, i) =>
      i === 0 || Math.abs(p.x - path[i - 1].x) > 1e-6 || Math.abs(p.y - path[i - 1].y) > 1e-6,
  );
  const segments = claimedSegmentsOf(cleaned, from, to, bands);
  if (segments.some((v) => conflicts(claimed, v))) return false;
  if (!polylineClearOf(cleaned, obstacles)) return false;
  edge.fromPoint = cleaned[0];
  edge.toPoint = cleaned[cleaned.length - 1];
  edge.waypoints = cleaned.slice(1, -1);
  claimed.push(...segments);
  return true;
}

/** Rows of cards by y, each with its interior gaps, top to bottom. */
function rowsOf(nodes: LayoutNode[]): {
  y: number;
  bottom: number;
  left: number;
  right: number;
  gaps: { left: number; right: number }[];
}[] {
  const byY = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    if (n.ghost) continue;
    const key = Math.round(n.y * 2) / 2;
    const row = byY.get(key);
    if (row) row.push(n);
    else byY.set(key, [n]);
  }
  const half = GUTTER_GAP / 2;
  return [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, cards]) => {
      cards.sort((a, b) => a.x - b.x);
      const gaps: { left: number; right: number }[] = [];
      for (let i = 0; i + 1 < cards.length; i++) {
        const left = cards[i].x + cards[i].width;
        const right = cards[i + 1].x;
        if (right - left >= 2 * half) gaps.push({ left, right });
      }
      return {
        y,
        bottom: Math.max(...cards.map((c) => c.y + c.height)),
        left: cards[0].x,
        right: cards[cards.length - 1].x + cards[cards.length - 1].width,
        gaps,
      };
    });
}

/**
 * A route's axis-aligned segment as a claim record: `at` is the fixed
 * coordinate. `owner` names the card side a stub leaves from; two stubs of
 * one card side are not a conflict, because `fanOutGutterPorts` spreads them
 * apart later — only stubs from *different* cards meeting in one gap are.
 */
interface ClaimedSegment {
  axis: "v" | "h";
  at: number;
  lo: number;
  hi: number;
  owner?: string;
}

function claimedSegmentsOf(
  path: Point[],
  from: EdgeBox,
  to: EdgeBox,
  bands: readonly { top: number; bottom: number }[],
): ClaimedSegment[] {
  const out: ClaimedSegment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const atPort = i === 0 || i === path.length - 2;
    const owner = i === 0 ? from.id : i === path.length - 2 ? to.id : undefined;
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
      out.push(verticalClaim(a.x, a.y, b.y, bands, owner));
    } else if (atPort && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) {
      // Only a side stub is claimed horizontally. A run along an inter-row
      // channel is not: the lane pass spreads those apart afterwards, and
      // claiming them would refuse every second edge a channel it can share.
      out.push({ axis: "h", at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), owner });
    }
  }
  return out;
}

/**
 * The empty bands between consecutive rows of cards — the inter-row channels
 * the lane pass later spreads horizontal runs across.
 */
function channelBandsOf(nodes: LayoutNode[]): { top: number; bottom: number }[] {
  const rows = rowsOf(nodes);
  const bands: { top: number; bottom: number }[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    if (rows[i + 1].y > rows[i].bottom) bands.push({ top: rows[i].bottom, bottom: rows[i + 1].y });
  }
  return bands;
}

/**
 * A vertical claim, extended to own its x across the whole of any inter-row
 * channel it ends inside (#2611).
 *
 * A vertical that stops at a channel does not stop *where* it was routed:
 * `distributeChannelLanes` moves the run it turns into to a lane of that
 * channel, dragging the vertical's end with it. Two routes that took one x in
 * adjacent bands, meeting exactly at the channel's midline, therefore came out
 * overlapping by however far the lane pass had moved them apart — a collision
 * created *after* the pass that checks for collisions. Claiming the whole
 * channel makes the resource what it physically is: the x is occupied for
 * every lane the run could later be given, so the next route picks another.
 */
function verticalClaim(
  at: number,
  y0: number,
  y1: number,
  bands: readonly { top: number; bottom: number }[],
  owner?: string,
): ClaimedSegment {
  let lo = Math.min(y0, y1);
  let hi = Math.max(y0, y1);
  for (const band of bands) {
    if (lo > band.top && lo < band.bottom) lo = band.top;
    if (hi > band.top && hi < band.bottom) hi = band.bottom;
  }
  return { axis: "v", at, lo, hi, owner };
}

function conflicts(claimed: readonly ClaimedSegment[], v: ClaimedSegment): boolean {
  return claimed.some(
    (c) =>
      c.axis === v.axis &&
      Math.abs(c.at - v.at) < 1e-6 &&
      Math.min(c.hi, v.hi) - Math.max(c.lo, v.lo) > 1e-6 &&
      !(c.owner !== undefined && c.owner === v.owner),
  );
}

/**
 * One end of an interior corridor route (#2611): the side stub
 * when it is clear; otherwise, for endpoints in different rows, the channel
 * stub `mixedEnd` would give a gutter route. Endpoints that overlap vertically
 * have no channel between them, so a blocked side stub ends the attempt.
 */
function corridorEnd(
  box: EdgeBox,
  corridor: Gutter,
  obstacles: Rect[],
  nodes: LayoutNode[],
  forward: boolean,
  backward: boolean,
  isSource: boolean,
  claimed: readonly ClaimedSegment[],
  bands: readonly { top: number; bottom: number }[],
): MixedEnd | null {
  const sideX = corridor.side === "right" ? box.x + box.width : box.x;
  const midY = box.y + box.height / 2;
  const sideClear = !segmentCrossesAnyRect(
    { x: sideX, y: midY },
    { x: corridor.x, y: midY },
    obstacles,
  );
  if (sideClear) return { port: { x: sideX, y: midY }, elbows: [], cy: midY };
  if (!forward && !backward) return null;
  return mixedEnd(box, corridor, obstacles, nodes, forward, isSource, claimed, bands);
}

/**
 * Plan a side-gutter route. Attaches source/target ports to the gutter side
 * of each node, runs horizontally out to the gutter, vertically along it, then
 * horizontally into the target. Returns the polyline only if all three
 * segments are obstacle-free.
 */
function planGutterRoute(
  from: EdgeBox,
  to: EdgeBox,
  gutter: Gutter,
  obstacles: Rect[],
): Point[] | null {
  const sourcePort: Point = {
    x: gutter.side === "right" ? from.x + from.width : from.x,
    y: from.y + from.height / 2,
  };
  const targetPort: Point = {
    x: gutter.side === "right" ? to.x + to.width : to.x,
    y: to.y + to.height / 2,
  };
  const w0: Point = { x: gutter.x, y: sourcePort.y };
  const w1: Point = { x: gutter.x, y: targetPort.y };
  const path = [sourcePort, w0, w1, targetPort];
  return polylineClearOf(path, obstacles) ? path : null;
}

/**
 * Aggregation trunks (Issue #1859, P2c slice B). After `routeGroupedEdges` sends
 * every cross-band edge out to a side gutter, edges that share an infra/external
 * **target** still land on the one default gutter x, so two targets' spines
 * overlap. This pass gives each shared target its own **trunk lane** and merges
 * its incoming edges onto a single vertical spine that enters the target once —
 * the grouping analogue of karasu's aggregation concept.
 *
 * Only fan-in targets (≥ 2 gutter-routed incoming edges) form a trunk. Each
 * trunked edge is tagged `trunkId = <target id>`; the elbow where its horizontal
 * stub meets the spine (`waypoints[0]`) is the merge point a junction dot marks
 * in P2c-C. Edge identity is preserved — each `LayoutEdge` stays its own line
 * sharing the spine geometry, not a single merged edge (ADR-1185 stance).
 *
 * Penetration-safe: trunk lanes sit in the right gutter (x > every card/frame),
 * so their verticals are clear by construction; each edge's candidate route is
 * still verified, and a target whose edges cannot all be cleanly re-routed keeps
 * the `routeGroupedEdges` result (never worse — AC-1 preserved).
 */
export function aggregateGroupTrunks(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
  expandedFrames?: Map<string, ContainerRect>,
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  const { maxRight } = contentBounds(nodes, frames);

  const { boxOf, framesOfNode } = resolveGroupBoxes(layoutNodes, frames, expandedFrames);

  // Group the gutter-routed edges (set by routeGroupedEdges) by their target.
  const byTarget = new Map<string, LayoutEdge[]>();
  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    if (!isVerticalGutterRoute(edge)) continue;
    const list = byTarget.get(edge.to);
    if (list) list.push(edge);
    else byTarget.set(edge.to, [edge]);
  }

  // Eligible trunks: a shared target with ≥ 2 incoming edges, all of which can
  // be cleanly re-routed onto a right-side spine. Clearance is lane-independent
  // (any x beyond maxRight has a clear vertical), so probe with a nominal x.
  const nominalX = maxRight + GUTTER_GAP;
  const eligible: { target: EdgeBox; edges: LayoutEdge[] }[] = [];
  for (const [targetId, edges] of byTarget) {
    if (edges.length < 2) continue;
    const target = boxOf(targetId);
    if (!target) continue;
    // Trunk the subset that can be cleanly re-routed onto the right spine. An
    // edge whose stub is blocked keeps its `routeGroupedEdges` result instead of
    // suppressing the trunk for every sibling — the resolvable edges still get
    // merged, and the blocked one is never worse than before (AC-1 preserved).
    const clear = edges.filter((e) => {
      const from = boxOf(e.from);
      if (!from) return false;
      const path = trunkPath(from, target, nominalX);
      return polylineClearOf(path, obstaclesFor(e, nodes, frames, framesOfNode));
    });
    if (clear.length >= 2) eligible.push({ target, edges: clear });
  }

  // Deterministic lane order: topmost target first, then id. Each trunk gets its
  // own vertical lane so distinct targets' spines no longer overlap.
  eligible.sort((a, b) => a.target.y - b.target.y || (a.target.id < b.target.id ? -1 : 1));
  eligible.forEach(({ target, edges }, lane) => {
    // Lanes start one gap *beyond* the default gutter (`maxRight + GUTTER_GAP`),
    // which `routeGroupedEdges` uses for non-trunked single edges — so a trunk
    // spine never co-renders on top of a single-incoming edge's spine.
    const trunkX = maxRight + GUTTER_GAP + (lane + 1) * TRUNK_LANE_GAP;
    const targetPort = rightPort(target);
    for (const edge of edges) {
      const from = boxOf(edge.from)!;
      const sourcePort = rightPort(from);
      edge.fromPoint = sourcePort;
      edge.toPoint = targetPort;
      edge.waypoints = [
        { x: trunkX, y: sourcePort.y },
        { x: trunkX, y: targetPort.y },
      ];
      edge.trunkId = target.id;
      // A trunked edge runs down the shared spine, so an against-flow dash would
      // stripe only its half of a spine it co-renders with forward siblings —
      // a visibly inconsistent solid/dashed overlap. The trunk subsumes the
      // backward signal, so clear it (the merge geometry, not the dash, conveys
      // fan-in). P2c-C's junction dot marks the merge.
      edge.groupBackward = false;
    }
  });
}

/**
 * Lane-separate non-trunked gutter corridors (Issue #1927, follow-up to #1859
 * P2c-B). `routeGroupedEdges` sends every non-trunked cross-band edge to *one*
 * shared gutter x (`maxRight + GUTTER_GAP`), so two edges with overlapping
 * y-ranges lay collinear vertical corridors on the identical x — they render as
 * one indistinguishable line (and read as a false connection). `aggregateGroupTrunks`
 * disambiguates only fan-in (≥ 2 incoming) targets; single-incoming gutter edges
 * keep colliding on the default gutter x. Runs *after* `aggregateGroupTrunks`.
 *
 * Each colliding corridor gets its own lane x, allocated by greedy interval
 * partitioning on the corridor y-range: corridors whose y-ranges are disjoint may
 * share a lane (no visual overlap → minimal width and snapshot churn); overlapping
 * ones get distinct lanes. Lane order is coordinate-derived (sorted by y then id),
 * so snapshots stay stable.
 *
 * Right-side lanes are numbered clear of the trunk lanes (P2c-B): overflow
 * single-edge lanes start *beyond* the rightmost trunk x actually allocated
 * (`maxTrunkX`), so a single-edge lane can never collide with a trunk spine. Lane 0
 * keeps the base gutter x (`maxRight + GUTTER_GAP`), which no trunk uses — so an edge
 * that never collided does not move. Left-side lanes step further left (trunks are
 * right-only).
 *
 * Penetration-safe by construction: every lane x lies beyond `maxRight` (or before
 * `minLeft`), where no card or frame exists, so widening a corridor never crosses an
 * obstacle — the horizontal stub only extends into already-empty territory, and the
 * vertical stays outside all obstacles (AC-1 preserved, never worse). Left-side lanes
 * can push x negative; `normalizeCoordinates` (layout-geometry.ts) folds edge waypoints into
 * its min and shifts every point non-negative, so they never clip on the left.
 */
export function distributeGutterLanes(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  const { minLeft, maxRight } = contentBounds(nodes, frames);
  const rightBase = maxRight + GUTTER_GAP;
  const leftBase = minLeft - GUTTER_GAP;

  // Rightmost trunk lane x actually allocated (P2c-B, right-only), so overflow
  // single-edge lanes can start *beyond* every trunk — no lane-x collision. Derived
  // from the real trunk geometry (not a lane count), so it stays correct even if
  // trunk lanes were ever allocated non-contiguously. Lane 0 keeps the base gutter
  // x, which no trunk uses (trunks sit at rightBase + (lane+1)·TRUNK_LANE_GAP).
  let maxTrunkX = rightBase;
  for (const e of layoutEdges) {
    if (e.trunkId && e.waypoints && e.waypoints.length === 2) {
      maxTrunkX = Math.max(maxTrunkX, e.waypoints[0].x);
    }
  }

  // Collect non-trunked gutter corridors set by `routeGroupedEdges` /
  // `tryMixedRoute`, split by side. A mixed route has extra channel elbows, so
  // locate its corridor with `gutterCorridor` rather than assuming waypoints[0].
  const right: { e: LayoutEdge; corridor: GutterCorridor }[] = [];
  const left: { e: LayoutEdge; corridor: GutterCorridor }[] = [];
  for (const e of layoutEdges) {
    if (e.ghost || e.cyclic) continue;
    if (e.trunkId) continue;
    const corridor = gutterCorridor(e);
    if (!corridor) continue;
    if (corridor.x > maxRight) right.push({ e, corridor });
    else if (corridor.x < minLeft) left.push({ e, corridor });
  }

  assignGutterLanes(right, (lane) => (lane === 0 ? rightBase : maxTrunkX + lane * TRUNK_LANE_GAP));
  assignGutterLanes(left, (lane) => leftBase - lane * TRUNK_LANE_GAP);
}

/**
 * Greedy interval partitioning of gutter corridors into lanes: corridors with
 * overlapping y-ranges land on distinct lanes, disjoint ones may share. `laneX`
 * maps a lane index to its gutter x. Rewrites only the corridor's two waypoints'
 * x to the assigned lane (ports, corridor y, and any channel elbows are
 * untouched — moving the corridor x automatically slides the channel horizontal
 * that meets it, staying orthogonal and clear beyond `maxRight`/`minLeft`).
 */
function assignGutterLanes(
  items: { e: LayoutEdge; corridor: GutterCorridor }[],
  laneX: (lane: number) => number,
): void {
  if (items.length === 0) return;
  // Deterministic order: by corridor start, then end, then edge identity.
  const ranges = [...items].sort(
    (a, b) => a.corridor.lo - b.corridor.lo || a.corridor.hi - b.corridor.hi || cmpEdgeId(a.e, b.e),
  );
  const laneEnds: number[] = []; // last-assigned corridor `hi` per lane
  for (const { e, corridor } of ranges) {
    // First lane whose corridor ends at or before this one starts (no overlap;
    // touching at a single point is not a visual overlap, so `<=`).
    let lane = laneEnds.findIndex((end) => end <= corridor.lo);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(corridor.hi);
    } else {
      laneEnds[lane] = corridor.hi;
    }
    const x = laneX(lane);
    const wps = e.waypoints!;
    wps[corridor.i] = { x, y: wps[corridor.i].y };
    wps[corridor.i + 1] = { x, y: wps[corridor.i + 1].y };
  }
}

type NodeSide = "left" | "right" | "top" | "bottom";

/**
 * One attachment of a gutter corridor to a node's edge: the source end of an
 * outgoing edge, the target end of an incoming edge, or — for a trunk — the one
 * shared target entry of all its siblings (moved together, staying merged).
 */
interface GutterAttach {
  edges: LayoutEdge[];
  /** Which end of each edge attaches here. */
  end: "source" | "target";
  /** Corridor far-end y — orders the fan so it nests (fewest crossings). */
  sortKey: number;
}

/**
 * Fan out the anchors of every edge that touches the same node on the same
 * side (Issue #1927, generalised in #2610). `routeGroupedEdges` /
 * `aggregateGroupTrunks` attach *every* gutter edge to the node's mid-edge
 * port (`y + height/2`), so two edges leaving **or entering** one node on one
 * side share that point and their horizontal stubs run **collinearly** — near
 * the node they render as one line, not N. This distributes the attachments
 * on a node/side across the side so each edge gets its own stub.
 *
 * **Every** attachment on the side takes part, not only the gutter corridors
 * this pass began with (#2610): an interior L (`routeOrthogonalEdges`) or a
 * straight edge keeps the port `distributePorts` gave it, and once the
 * gutter edges are fanned over the same side independently of those, a fanned
 * position lands on a port that is still in use — two edges into one card
 * sharing the drop into it, which is exactly what the pass exists to prevent.
 * One distribution per side, over everything attached there, cannot collide
 * with itself. A side nothing rerouted comes out where `distributePorts` put
 * it (same positions, same order), so untouched diagrams are unchanged.
 *
 * Trunk siblings (same `trunkId`) share ONE target entry by design (the P2c-B
 * merge) — they count as a single attachment and move together, staying merged.
 *
 * Left/right attachments fan out across the node *height* (vary y);
 * top/bottom attachments fan across the node *width* (vary x). Attachments
 * are ordered by where the route goes next — the coordinate, along the side,
 * of the first bend away from the port (for a straight edge, its far end) —
 * so the fan nests and stubs do not cross each other at the card.
 *
 * Runs *after* `distributeGutterLanes` so the lane x's are final. Only a
 * node/side with >= 2 attachments moves; a lone one keeps its port (no churn).
 *
 * Penetration-safe: each restubbed route is verified against the obstacle set
 * and a move is applied only if every edge in the attachment stays clear, else
 * the anchor is left where it was (never worse — AC-1 preserved). A stub
 * perpendicular to the side carries its adjacent bend along, so the route
 * keeps its shape; a slanted first segment (a straight edge) just re-aims.
 *
 * The fan is spread over the side's **attachable spans** (#2608) — what the
 * shape's outline covers, minus the chrome keep-outs — through the same
 * mapping `distributePorts` uses, rather than over the bounding box. Spread
 * over the box, every position that landed under a corner chip or off a
 * cylinder's rim was later clamped by `seatPortsOnOutline` onto the span's
 * edge, and several fanned edges came back out of that clamp sharing one
 * port: the collinear stubs this pass exists to prevent, re-created two passes
 * later. Without a resolver the spans are the whole side and the fan is what
 * it always was.
 */
export function fanOutGutterPorts(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
  expandedFrames?: Map<string, ContainerRect>,
  ports?: PortResolver,
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;
  const { boxOf, framesOfNode } = resolveGroupBoxes(layoutNodes, frames, expandedFrames);

  // Collect attachments per (box, side). A box is a node card or an expanded
  // container frame (#1923), so several service-level edges leaving one frame on
  // one side get fanned out just like a node's edges. Trunk target-entries are
  // merged per `trunkId` so all siblings share one slot (and one moved entry
  // point). Keyed by box object (not a delimited string), so ids with spaces are
  // safe.
  const emptySides = (): Record<NodeSide, GutterAttach[]> => ({
    left: [],
    right: [],
    top: [],
    bottom: [],
  });
  const bySide = new Map<EdgeBox, Record<NodeSide, GutterAttach[]>>();
  const trunkSlot = new Map<string, GutterAttach>(); // by `trunkId` (unique per target)
  const push = (node: EdgeBox, side: NodeSide, a: GutterAttach) => {
    let rec = bySide.get(node);
    if (!rec) bySide.set(node, (rec = emptySides()));
    rec[side].push(a);
  };

  for (const e of layoutEdges) {
    if (e.ghost || e.cyclic) continue;
    const from = boxOf(e.from);
    const to = boxOf(e.to);
    if (!from || !to) continue;
    // Only an anchor that sits on a side can be fanned along it.
    const srcSide = sideOf(from, e.fromPoint);
    const tgtSide = sideOf(to, e.toPoint);
    const pts = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    if (srcSide) {
      push(from, srcSide, { edges: [e], end: "source", sortKey: bendKey(pts, srcSide) });
    }
    if (!tgtSide) continue;
    const tgtKey = bendKey([...pts].reverse(), tgtSide);
    // Target end: a trunk's siblings share one entry (unique per `trunkId`), so merge them.
    if (e.trunkId) {
      const slot = trunkSlot.get(e.trunkId);
      if (slot) slot.edges.push(e);
      else {
        const a: GutterAttach = { edges: [e], end: "target", sortKey: tgtKey };
        trunkSlot.set(e.trunkId, a);
        push(to, tgtSide, a);
      }
    } else {
      push(to, tgtSide, { edges: [e], end: "target", sortKey: tgtKey });
    }
  }

  // What every edge currently occupies, so a fanned anchor is not moved onto
  // a column another edge already runs in (#2611). Kept up to date as moves
  // are applied, so two fans in a row cannot land on each other either.
  const bands = channelBandsOf(nodes);
  const occupancy = buildSegmentIndex(layoutEdges, bands);

  // Obstacle sets depend only on an edge's endpoints/frames, not on the fanned
  // anchor, so compute each once and reuse across a node's attachments.
  const obstacleCache = new Map<LayoutEdge, Rect[]>();
  const obstaclesOf = (e: LayoutEdge): Rect[] => {
    let o = obstacleCache.get(e);
    if (!o) obstacleCache.set(e, (o = obstaclesFor(e, nodes, frames, framesOfNode)));
    return o;
  };

  for (const [node, rec] of bySide) {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const attaches = rec[side];
      if (attaches.length < 2) continue;
      // Left/right ports sit on a vertical border → distribute along height (vary
      // y, horizontal stub). Top/bottom ports sit on a horizontal border →
      // distribute along width (vary x, vertical stub).
      const varyY = side === "left" || side === "right";
      const fixed =
        side === "right"
          ? node.x + node.width
          : side === "left"
            ? node.x
            : side === "bottom"
              ? node.y + node.height
              : node.y;
      // Nest the fan by corridor far-end y (deterministic tie-break on edge id).
      attaches.sort((a, b) => a.sortKey - b.sortKey || cmpEdgeId(a.edges[0], b.edges[0]));
      const n = attaches.length;
      // An expanded frame is not a node and has no port frame; the resolver
      // only answers for the card it was given.
      const asNode = layoutNodes.get(node.id);
      const resolved = asNode === node ? ports?.(asNode) : undefined;
      const spans = attachableSpans(
        node,
        side,
        resolved?.frame ?? BBOX_PORT_FRAME,
        resolved?.keepOuts ?? [],
      );
      attaches.forEach((a, i) => {
        // Where this attachment sits in the fan, and the room it may shift
        // within without ever passing its neighbours: a quarter and a half of
        // its own slot to either side (#2611). The plain position is tried
        // first, so a side with nothing in its way fans exactly as before.
        const restub = (along: number) => {
          const t = varyY ? node.y + node.height * along : node.x + node.width * along;
          const anchor: Point = varyY ? { x: fixed, y: t } : { x: t, y: fixed };
          // Restub every edge in the attachment, verify all clear, then apply
          // atomically (a trunk moves all its siblings' shared entry
          // together). A bend adjacent to the port that shares its coordinate
          // along the side (a perpendicular stub) takes the fanned one too, so
          // the stub stays orthogonal; a slanted first segment, or a straight
          // edge, just re-aims.
          return a.edges.map((e) => {
            const wps = [...(e.waypoints ?? [])];
            const port = a.end === "source" ? e.fromPoint : e.toPoint;
            const step = a.end === "source" ? 1 : -1;
            // Every bend the stub carries with it: the one next to the port
            // when it shares the port's coordinate along the side, and each
            // further bend that shares it too. A stub used to be a single
            // segment, so moving one bend kept the polyline orthogonal —
            // until a staircase ended in a run of bends on one x (#2611), and
            // moving only the last of them bent that run into a diagonal.
            // Whatever the shape, the invariant is the same: the whole
            // collinear run moves, and the segment beyond it (perpendicular
            // by construction) simply gets longer or shorter.
            for (
              let at = a.end === "source" ? 0 : wps.length - 1;
              at >= 0 && at < wps.length;
              at += step
            ) {
              const bend = wps[at];
              const offAxis = varyY ? bend.y - port.y : bend.x - port.x;
              if (Math.abs(offAxis) > 1e-6) break;
              wps[at] = varyY ? { x: bend.x, y: t } : { x: t, y: bend.y };
            }
            return a.end === "source"
              ? { e, fromPoint: anchor, toPoint: e.toPoint, waypoints: wps }
              : { e, fromPoint: e.fromPoint, toPoint: anchor, waypoints: wps };
          });
        };
        const siblings = new Set(a.edges);
        const before = new Map(
          a.edges.map((e) => [e, [e.fromPoint, ...(e.waypoints ?? []), e.toPoint]]),
        );
        const clearOfCards = (moved: ReturnType<typeof restub>) =>
          moved.every((m) =>
            polylineClearOf([m.fromPoint, ...m.waypoints, m.toPoint], obstaclesOf(m.e)),
          );
        // A stub must also not land *on* another edge's run: the routing
        // passes arbitrate the columns between themselves, and a fan that
        // ignored them would re-create, two passes later, exactly the
        // collinear overlap they avoided (#2611). Only what the re-stub moved
        // is judged — a segment that stayed put was arbitrated when its route
        // was chosen.
        const clearOfEdges = (moved: ReturnType<typeof restub>) =>
          moved.every(
            (m) =>
              !changedSegments(before.get(m.e)!, [m.fromPoint, ...m.waypoints, m.toPoint], bands)
                // Verticals only. Every horizontal run still sits on its
                // channel's midline at this point — `distributeChannelLanes`
                // spreads them afterwards — so judging them here would call
                // every candidate occupied and fan nothing.
                .filter((seg) => seg.axis === "v")
                .some((seg) => occupancy.occupied(seg, siblings)),
          );
        const slot = 1 / (n + 1);
        let moved: ReturnType<typeof restub> | null = null;
        for (const shift of [0, 0.25, -0.25, 0.5, -0.5]) {
          const candidate = restub(mapToSpans(spans, (i + 1 + shift) * slot));
          if (!clearOfCards(candidate)) continue;
          if (!clearOfEdges(candidate)) continue;
          moved = candidate;
          break;
        }
        // Nothing free anywhere in this attachment's share: take the plain
        // position if the cards allow it, exactly as this pass behaved before
        // it knew about the other edges. Two edges apart on a shared column
        // still read better than two stacked on one port.
        if (!moved) {
          const plain = restub(mapToSpans(spans, (i + 1) * slot));
          if (clearOfCards(plain)) moved = plain;
        }
        if (moved) {
          for (const m of moved) {
            const after = [m.fromPoint, ...m.waypoints, m.toPoint];
            occupancy.replace(m.e, before.get(m.e)!, after);
            m.e.fromPoint = m.fromPoint;
            m.e.toPoint = m.toPoint;
            m.e.waypoints = m.waypoints.length > 0 ? m.waypoints : m.e.waypoints;
          }
        }
      });
    }
  }
}


/**
 * The axis-aligned segments every edge currently occupies, bucketed by their
 * fixed coordinate (#2611).
 *
 * `fanOutGutterPorts` moves a port along its side and drags the stub with it,
 * verifying the result against cards and frames — but not against the other
 * edges. With interior corridors in play that is no longer enough: a fanned
 * port can land exactly on the column a different edge is already running in,
 * re-creating the collinear overlap the routing passes had arbitrated away,
 * two passes later. The index lets the fan ask the same question the router
 * asks — "is this resource taken?" — about whatever the chain has produced so
 * far, so it needs no knowledge of route shapes (TPL-1954).
 */
interface SegmentIndex {
  /** Whether `seg` would lie collinear on a segment of an edge outside `exempt`. */
  occupied(seg: OccupiedSegment, exempt: ReadonlySet<LayoutEdge>): boolean;
  /** Swap an edge's recorded geometry for the one just applied to it. */
  replace(edge: LayoutEdge, before: readonly Point[], after: readonly Point[]): void;
}

interface OccupiedSegment {
  axis: "v" | "h";
  at: number;
  lo: number;
  hi: number;
}

function segmentsOfPolyline(
  pts: readonly Point[],
  bands: readonly { top: number; bottom: number }[],
): OccupiedSegment[] {
  const out: OccupiedSegment[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
      // Same extension the router claims with: a vertical that ends inside a
      // channel owns its x across the whole channel, because the lane pass
      // will move that end to one of the channel's lanes (see `verticalClaim`).
      const claim = verticalClaim(a.x, a.y, b.y, bands);
      out.push({ axis: "v", at: claim.at, lo: claim.lo, hi: claim.hi });
    } else if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) {
      out.push({ axis: "h", at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    }
  }
  return out;
}

/** Segments whose endpoints a re-stub actually moved — the only ones to re-check. */
function changedSegments(
  before: readonly Point[],
  after: readonly Point[],
  bands: readonly { top: number; bottom: number }[],
): OccupiedSegment[] {
  const same = (a: Point | undefined, b: Point | undefined) =>
    a !== undefined && b !== undefined && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  if (before.length !== after.length) return segmentsOfPolyline(after, bands);
  const out: OccupiedSegment[] = [];
  for (let i = 0; i + 1 < after.length; i++) {
    if (same(before[i], after[i]) && same(before[i + 1], after[i + 1])) continue;
    out.push(...segmentsOfPolyline([after[i], after[i + 1]], bands));
  }
  return out;
}

function buildSegmentIndex(
  edges: readonly LayoutEdge[],
  bands: readonly { top: number; bottom: number }[],
): SegmentIndex {
  const bucketKey = (seg: OccupiedSegment) => `${seg.axis}:${Math.round(seg.at * 2)}`;
  const buckets = new Map<string, { edge: LayoutEdge; seg: OccupiedSegment }[]>();
  const add = (edge: LayoutEdge, pts: readonly Point[]) => {
    for (const seg of segmentsOfPolyline(pts, bands)) {
      const key = bucketKey(seg);
      const bucket = buckets.get(key);
      if (bucket) bucket.push({ edge, seg });
      else buckets.set(key, [{ edge, seg }]);
    }
  };
  const remove = (edge: LayoutEdge, pts: readonly Point[]) => {
    for (const seg of segmentsOfPolyline(pts, bands)) {
      const bucket = buckets.get(bucketKey(seg));
      if (!bucket) continue;
      const at = bucket.findIndex(
        (entry) =>
          entry.edge === edge &&
          Math.abs(entry.seg.at - seg.at) < 1e-6 &&
          Math.abs(entry.seg.lo - seg.lo) < 1e-6 &&
          Math.abs(entry.seg.hi - seg.hi) < 1e-6,
      );
      if (at >= 0) bucket.splice(at, 1);
    }
  };
  for (const edge of edges) {
    if (edge.ghost || edge.cyclic) continue;
    add(edge, [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint]);
  }
  return {
    occupied(seg, exempt) {
      const bucket = buckets.get(bucketKey(seg));
      if (!bucket) return false;
      return bucket.some(
        (entry) =>
          !exempt.has(entry.edge) &&
          entry.seg.axis === seg.axis &&
          Math.abs(entry.seg.at - seg.at) < 1e-6 &&
          Math.min(entry.seg.hi, seg.hi) - Math.max(entry.seg.lo, seg.lo) > 1e-6,
      );
    },
    replace(edge, before, after) {
      remove(edge, before);
      add(edge, after);
    },
  };
}

/** The right-side trunk polyline for one source→target edge at column `x`. */
function trunkPath(from: EdgeBox, target: EdgeBox, x: number): Point[] {
  const sourcePort = rightPort(from);
  const targetPort = rightPort(target);
  return [sourcePort, { x, y: sourcePort.y }, { x, y: targetPort.y }, targetPort];
}

/** A `routeGroupedEdges` gutter route: two waypoints forming a vertical corridor. */
function isVerticalGutterRoute(edge: LayoutEdge): boolean {
  return (
    edge.waypoints !== undefined &&
    edge.waypoints.length === 2 &&
    edge.waypoints[0].x === edge.waypoints[1].x
  );
}

/** The vertical gutter corridor of a grouped route. */
interface GutterCorridor {
  /** Index of the first of the two consecutive waypoints forming the corridor. */
  i: number;
  x: number;
  lo: number;
  hi: number;
}

/**
 * Locate the single vertical gutter corridor of a grouped route — the pair of
 * consecutive *internal* waypoints sharing an x. Works for both the plain
 * 2-waypoint side route (`[corridorTop, corridorBottom]`, `i = 0`) and the
 * multi-waypoint **mixed route** (`tryMixedRoute`), where a channel end adds an
 * elbow before/after the corridor. The endpoint drops (fromPoint→waypoints[0]
 * and waypoints[last]→toPoint) are *outside* the internal scan, so a channel
 * end's own vertical drop is never mistaken for the corridor. Returns null for a
 * straight edge (no corridor), which the lane/fan passes then skip — exactly as
 * they skipped straight edges before. Generalises `isVerticalGutterRoute` so the
 * #1927 overlap passes cover mixed routes, not just 2-waypoint ones.
 */
function gutterCorridor(edge: LayoutEdge): GutterCorridor | null {
  const wps = edge.waypoints;
  if (!wps || wps.length < 2) return null;
  for (let i = 0; i < wps.length - 1; i++) {
    if (wps[i].x === wps[i + 1].x && wps[i].y !== wps[i + 1].y) {
      return {
        i,
        x: wps[i].x,
        lo: Math.min(wps[i].y, wps[i + 1].y),
        hi: Math.max(wps[i].y, wps[i + 1].y),
      };
    }
  }
  return null;
}

/**
 * Which edge of `node` a port sits on, or null when it sits on none (an
 * endpoint seated inside a shape's outline, say). Check left/right first so a
 * corner classifies as a side port, the way every gutter route anchors.
 */
function sideOf(node: EdgeBox, port: Point): NodeSide | null {
  const eps = 0.5;
  const withinY = port.y >= node.y - eps && port.y <= node.y + node.height + eps;
  const withinX = port.x >= node.x - eps && port.x <= node.x + node.width + eps;
  if (withinY && Math.abs(port.x - node.x) < eps) return "left";
  if (withinY && Math.abs(port.x - (node.x + node.width)) < eps) return "right";
  if (withinX && Math.abs(port.y - node.y) < eps) return "top";
  if (withinX && Math.abs(port.y - (node.y + node.height)) < eps) return "bottom";
  return null;
}

/**
 * Where a route heads after leaving a port on `side`: the coordinate along the
 * side of the first point that differs from the port along that axis — the
 * corridor's far end for a gutter route, the channel's far end for an interior
 * L, the other endpoint for a straight edge. Fans nest when ordered by it.
 * `pts` starts at the port.
 */
function bendKey(pts: readonly Point[], side: NodeSide): number {
  const varyY = side === "left" || side === "right";
  const port = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (varyY ? Math.abs(p.y - port.y) > 1e-6 : Math.abs(p.x - port.x) > 1e-6) {
      return varyY ? p.y : p.x;
    }
  }
  const last = pts[pts.length - 1];
  return varyY ? last.y : last.x;
}

/**
 * Map each node id to the ids of the group frames that enclose it.
 *
 * A **set**, not one id: since #2179 a boundary frame can be widened to reach a
 * member placed in another band, so a shared card genuinely sits inside two
 * frames at once. The old "frames are disjoint by construction, so stop at the
 * first match" would have picked whichever came first in the container list and
 * then treated the other frame as an obstacle for that card's own edges.
 *
 * Containment is tested against {@link framePieces} — the rects the frame really
 * covers — so a card that merely falls inside an L-shaped frame's bounding box
 * is not counted as enclosed.
 */
function buildFramesOfNode(
  layoutNodes: Map<string, LayoutNode>,
  frames: ContainerRect[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const n of layoutNodes.values()) {
    const ids = new Set<string>();
    for (const f of frames) {
      const inside = framePieces(f).some(
        (p) =>
          n.x >= p.x &&
          n.x + n.width <= p.x + p.width &&
          n.y >= p.y &&
          n.y + n.height <= p.y + p.height,
      );
      if (inside) ids.add(f.id);
    }
    out.set(n.id, ids);
  }
  return out;
}

/**
 * The rects a frame occupies: its `coverage` when it was widened (#2179), else
 * the recorded rect. Routing must use these — an L-shaped frame's bounding box
 * spans rows it does not enclose, and treating that box as an obstacle would
 * push edges around empty space.
 */
export function framePieces(frame: ContainerRect): readonly Rect[] {
  return frame.coverage ?? [frame];
}
