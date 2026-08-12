// Where an edge is allowed to touch a node, and where that lands in px
// (#2422, design doc docs/design/node-chrome-and-ports.md P10).
//
// Ports used to be placed on the bounding box, which is only the drawn
// outline for a rectangle. On everything else the arrowhead ended somewhere
// the shape is not: on a `user` card it stopped in the empty corner beside the
// medallion, on a cylinder it floated above the rim. The shape now says which
// parts of each side it actually covers (`spans`) and how far in its outline
// sits there (`depth`), and this module turns that — minus the keep-outs the
// card's own chrome claims — into a point.
//
// The span arithmetic is deliberately separate from the distribution rule
// (#968 / ADR-968 place N edges at i/(N+1)): distribution decides the order
// and the spacing, this decides what the resulting fraction means in space.

import type { LayoutEdge, LayoutNode, Rect } from "./layout-types.js";
import { polylineClearOf } from "./edge-geometry.js";
import type { ShapePortFrame, ShapePortSide } from "../shapes/shape-registry.js";

export type Side = "top" | "bottom" | "left" | "right";

/** An interval along one side, as fractions of that side's length. */
export interface Span {
  from: number;
  to: number;
}

/** What a node's outline offers an edge. */
export interface NodePorts {
  frame: ShapePortFrame;
  keepOuts: readonly Rect[];
}

/** Resolves a node's port frame; nodes without one keep the bounding box. */
export type PortResolver = (node: LayoutNode) => NodePorts | undefined;

/** The box a port is placed on. */
interface PortBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_SIDE: ShapePortSide = { spans: [{ from: 0, to: 1 }], depth: 0 };

/** The bounding box itself — what a rectangle's outline already is. */
export const BBOX_PORT_FRAME: ShapePortFrame = {
  top: FULL_SIDE,
  right: FULL_SIDE,
  bottom: FULL_SIDE,
  left: FULL_SIDE,
};

/** Length of a side in px. */
function sideLength(box: PortBox, side: Side): number {
  return side === "top" || side === "bottom" ? box.width : box.height;
}

/**
 * Projects a keep-out rectangle onto a side as the span it blocks. Returns
 * null when the rectangle has no business with that side.
 *
 * A corner chip claims the top and the right of the card it sits in, and
 * nothing on the far side — the test is which half of the card the rectangle
 * lies in. Without it a chip in the top-right corner would also push the ports
 * on the *bottom* edge leftwards, moving edges that pass nowhere near it.
 */
export function keepOutSpan(box: PortBox, side: Side, rect: Rect): Span | null {
  const length = sideLength(box, side);
  if (length <= 0) return null;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const nearSide =
    side === "top"
      ? centerY < box.y + box.height / 2
      : side === "bottom"
        ? centerY > box.y + box.height / 2
        : side === "left"
          ? centerX < box.x + box.width / 2
          : centerX > box.x + box.width / 2;
  if (!nearSide) return null;

  const [start, from, to] =
    side === "top" || side === "bottom"
      ? [box.x, rect.x, rect.x + rect.width]
      : [box.y, rect.y, rect.y + rect.height];
  const span = { from: (from - start) / length, to: (to - start) / length };
  if (span.to <= 0 || span.from >= 1) return null;
  return { from: Math.max(0, span.from), to: Math.min(1, span.to) };
}

/** `spans` minus `blocked`, keeping ascending order. Empty when all blocked. */
export function subtractSpans(spans: readonly Span[], blocked: readonly Span[]): Span[] {
  let out = spans.map((s) => ({ ...s }));
  for (const cut of blocked) {
    const next: Span[] = [];
    for (const span of out) {
      if (cut.to <= span.from || cut.from >= span.to) {
        next.push(span);
        continue;
      }
      if (cut.from > span.from) next.push({ from: span.from, to: cut.from });
      if (cut.to < span.to) next.push({ from: cut.to, to: span.to });
    }
    out = next;
  }
  return out;
}

/**
 * The spans an edge may attach to on one side: what the shape covers, minus
 * what the card's chrome claims.
 *
 * A keep-out that would leave nothing is ignored — an edge has to land
 * somewhere, and a port under a chip still reads better than an edge that
 * stops in open space. The shape's own spans are never given up for the same
 * reason: they are the outline itself.
 */
export function attachableSpans(
  box: PortBox,
  side: Side,
  frame: ShapePortFrame,
  keepOuts: readonly Rect[] = [],
): Span[] {
  const shapeSpans = frame[side].spans.map((s) => ({ ...s }));
  if (keepOuts.length === 0) return shapeSpans;
  const blocked = keepOuts
    .map((rect) => keepOutSpan(box, side, rect))
    .filter((s): s is Span => s !== null);
  const remaining = subtractSpans(shapeSpans, blocked);
  return remaining.length > 0 ? remaining : shapeSpans;
}

/** Total length of a span list, as a fraction of the side. */
function totalLength(spans: readonly Span[]): number {
  return spans.reduce((sum, s) => sum + (s.to - s.from), 0);
}

/**
 * Maps `t` ∈ [0,1] — the distribution rule's position on a whole side — onto
 * the attachable spans, proportionally to their lengths.
 *
 * Proportional rather than nearest-point: clamping each port to the closest
 * allowed position would pile several of them onto the same span edge, which
 * is exactly the fan-out that #968 spread apart. Mapping keeps the order and
 * the relative spacing that the distribution decided.
 */
export function mapToSpans(spans: readonly Span[], t: number): number {
  if (spans.length === 0) return t;
  const total = totalLength(spans);
  if (total <= 0) return spans[0].from;
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (const span of spans) {
    const length = span.to - span.from;
    if (remaining <= length) return span.from + remaining;
    remaining -= length;
  }
  return spans[spans.length - 1].to;
}

/** Depth in px at a position along the side. */
function depthAt(side: ShapePortSide, along: number): number {
  return typeof side.depth === "function" ? side.depth(along) : side.depth;
}

/**
 * The point at fraction `t` of a side: mapped into the attachable spans, then
 * pushed inward by the outline's depth there.
 */
export function portPoint(
  box: PortBox,
  side: Side,
  t: number,
  frame: ShapePortFrame,
  keepOuts: readonly Rect[] = [],
): { x: number; y: number } {
  const along = mapToSpans(attachableSpans(box, side, frame, keepOuts), t);
  const depth = depthAt(frame[side], along);
  switch (side) {
    case "top":
      return { x: box.x + box.width * along, y: box.y + depth };
    case "bottom":
      return { x: box.x + box.width * along, y: box.y + box.height - depth };
    case "left":
      return { x: box.x + depth, y: box.y + box.height * along };
    case "right":
      return { x: box.x + box.width - depth, y: box.y + box.height * along };
  }
}

/**
 * Seats every edge endpoint on the outline, after routing has had its say.
 *
 * `distributePorts` maps the *distribution* onto the attachable spans before
 * routing, so a fan of edges compresses into the part of the side the shape
 * actually covers. But the candidate chain re-anchors whatever it reroutes
 * (a corridor or gutter route picks its own port), so the guarantee has to be
 * re-established at the end.
 *
 * Two moves, with different risk:
 *
 * - **Inward by the outline's depth** — always applied. It runs along the
 *   side's normal, which is the direction the edge's last segment already
 *   points, so the stub shortens and no other geometry moves.
 * - **Along the side, into an attachable span** — only when the last segment
 *   can carry the endpoint with it and the result is still obstacle-free. The
 *   chain's own rule (`tryCorridorRoute`: apply only when the whole polyline is
 *   clear, never worse) is the right one to borrow here: an endpoint under a
 *   chip is a blemish, an edge through a card is a lie.
 */
export function seatPortsOnOutline(
  nodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  resolve: PortResolver,
  obstaclesFor: (edge: LayoutEdge) => Rect[],
): void {
  for (const edge of edges) {
    if (edge.ghost || edge.cyclic) continue;
    const obstacles = obstaclesFor(edge);
    seatEndpoint(edge, true, nodes, resolve, obstacles);
    seatEndpoint(edge, false, nodes, resolve, obstacles);
  }
}

function seatEndpoint(
  edge: LayoutEdge,
  isFrom: boolean,
  nodes: Map<string, LayoutNode>,
  resolve: PortResolver,
  obstacles: readonly Rect[],
): void {
  const node = nodes.get(isFrom ? edge.from : edge.to);
  if (!node) return;
  const ports = resolve(node);
  if (!ports) return;
  const point = isFrom ? edge.fromPoint : edge.toPoint;
  const side = sideOf(point, node);
  if (!side) return;

  const horizontal = side === "top" || side === "bottom";
  const length = horizontal ? node.width : node.height;
  if (length <= 0) return;
  const start = horizontal ? node.x : node.y;
  const along = ((horizontal ? point.x : point.y) - start) / length;

  // Two targets, two strengths. The outline is a fact — an endpoint off it
  // points at nothing — so reaching it is worth tilting a straight edge. The
  // chrome keep-out is a preference: taken when the edge has a bend that can
  // carry the endpoint sideways, dropped when the bill would be a slant in a
  // diagram whose language is right angles.
  const keepOutTarget = nearestInSpans(
    attachableSpans(node, side, ports.frame, ports.keepOuts),
    along,
  );
  const outlineTarget = nearestInSpans(attachableSpans(node, side, ports.frame), along);
  const slide =
    planSlide(edge, isFrom, side, along, keepOutTarget, length, obstacles, false) ??
    planSlide(edge, isFrom, side, along, outlineTarget, length, obstacles, true);
  slide?.apply();

  const settled = slide ? slide.target : along;
  const depth = depthAt(ports.frame[side], settled);
  // Written as a fresh object, never mutated in place: `aggregateGroupTrunks`
  // hands one `Point` to every sibling of a trunk, so a `+=` here would drag
  // endpoints whose own waypoints stay put and leave diagonal, unchecked stubs.
  const seated = { ...(isFrom ? edge.fromPoint : edge.toPoint) };
  if (side === "top") seated.y = node.y + depth;
  else if (side === "bottom") seated.y = node.y + node.height - depth;
  else if (side === "left") seated.x = node.x + depth;
  else seated.x = node.x + node.width - depth;
  if (isFrom) edge.fromPoint = seated;
  else edge.toPoint = seated;
}

/**
 * Plans a slide of the endpoint — and of the waypoint its last segment shares
 * a coordinate with — to `target`. Returns null when the move is refused: the
 * segment cannot follow, the result would put the polyline through something,
 * or it would tilt a straight edge and `allowTilt` says no.
 *
 * Nothing is written until `apply()`, and `apply()` replaces points rather
 * than editing them, because a `Point` here may be shared with sibling edges.
 */
function planSlide(
  edge: LayoutEdge,
  isFrom: boolean,
  side: Side,
  along: number,
  target: number,
  length: number,
  obstacles: readonly Rect[],
  allowTilt: boolean,
): { target: number; apply: () => void } | null {
  const delta = (target - along) * length;
  if (Math.abs(delta) < 1e-6) return { target: along, apply: () => {} };

  const point = isFrom ? edge.fromPoint : edge.toPoint;
  const waypoints = edge.waypoints;
  const horizontal = side === "top" || side === "bottom";
  const axis = horizontal ? "x" : "y";
  const neighbourIndex =
    waypoints && waypoints.length > 0 ? (isFrom ? 0 : waypoints.length - 1) : -1;
  const neighbour = neighbourIndex >= 0 ? waypoints![neighbourIndex] : undefined;
  const movedPoint = { ...point, [axis]: point[axis] + delta };

  if (!neighbour) {
    if (!allowTilt) return null;
    // A straight edge has no waypoint to carry, so the line tilts. Cheap as
    // that looks, it still has to clear what it crosses.
    const other = isFrom ? edge.toPoint : edge.fromPoint;
    const path = isFrom ? [movedPoint, other] : [other, movedPoint];
    if (!polylineClearOf(path, obstacles as Rect[])) return null;
    return {
      target,
      apply: () => {
        if (isFrom) edge.fromPoint = movedPoint;
        else edge.toPoint = movedPoint;
      },
    };
  }
  // The last segment has to be perpendicular to the side for the endpoint to
  // slide; otherwise moving it would leave a diagonal stub.
  if (Math.abs(neighbour[axis] - point[axis]) > 1e-6) return null;

  const movedNeighbour = { ...neighbour, [axis]: neighbour[axis] + delta };
  const rest = waypoints ?? [];
  const path = isFrom
    ? [movedPoint, movedNeighbour, ...rest.slice(1), edge.toPoint]
    : [edge.fromPoint, ...rest.slice(0, -1), movedNeighbour, movedPoint];
  if (!polylineClearOf(path, obstacles as Rect[])) return null;

  return {
    target,
    apply: () => {
      if (isFrom) edge.fromPoint = movedPoint;
      else edge.toPoint = movedPoint;
      const next = [...rest];
      next[neighbourIndex] = movedNeighbour;
      edge.waypoints = next;
    },
  };
}

/** True when `along` already sits in a span; otherwise the closest edge of one. */
function nearestInSpans(spans: readonly Span[], along: number): number {
  if (spans.length === 0) return along;
  let best = spans[0].from;
  let bestDistance = Infinity;
  for (const span of spans) {
    if (along >= span.from && along <= span.to) return along;
    for (const candidate of [span.from, span.to]) {
      const distance = Math.abs(candidate - along);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return best;
}

/** Which side of the box the point sits on, or null when it is on none. */
function sideOf(point: { x: number; y: number }, box: PortBox): Side | null {
  const eps = 0.5;
  if (Math.abs(point.y - box.y) < eps) return "top";
  if (Math.abs(point.y - (box.y + box.height)) < eps) return "bottom";
  if (Math.abs(point.x - box.x) < eps) return "left";
  if (Math.abs(point.x - (box.x + box.width)) < eps) return "right";
  return null;
}
