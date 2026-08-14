/**
 * Port distribution for edges that share a node side (Phase 3 of #968 — see
 * ADR-968 and Issue #996).
 *
 * When N ≥ 2 edges anchor on the same side of a node (typically a hub
 * node's bottom side, with several outgoing edges), the default
 * `computeEdgePoints` puts them all at the side's midpoint. The labels then
 * sit on top of each other and the edges run on near-identical lines.
 *
 * This pass spreads the edges across the side at deterministic positions
 * `i/(N+1)` for i ∈ [1..N], sorted so edges don't cross each other at the
 * node side: for top/bottom sides we sort by the x of the opposite endpoint
 * (leftmost endpoint gets the leftmost port); for left/right sides we sort
 * by the y of the opposite endpoint.
 *
 * Out of scope (per ADR): ghost edges and cyclic edges are skipped — they
 * have specialised anchor logic that we don't disturb.
 *
 * Since #2422 this pass also decides what a position on a side *means*: the
 * shape says which parts of the side its outline covers and how deep it sits
 * (`portFrame`), and the card's own chrome claims keep-outs. That lookup is
 * injected as `resolvePorts` rather than imported, so the distribution rule
 * stays independent of the style resolution the frames need. A single anchor
 * goes through the same mapping — a lone edge into the middle of a `user`
 * card's top is exactly the endpoint that used to stop beside the medallion —
 * which is why the group loop no longer skips N === 1.
 *
 * Run before `routeOrthogonalEdges` so the channel routing uses the
 * distributed ports.
 */
import type { LayoutEdge, LayoutNode } from "./layout-types.js";
import { BBOX_PORT_FRAME, portPoint, type PortResolver, type Side } from "./port-frame.js";

interface Anchor {
  edge: LayoutEdge;
  isFrom: boolean;
}

/** What an anchor can sit on: a node card, or an expanded container's frame. */
export type AnchorRect = { x: number; y: number; width: number; height: number };

const SIDE_EPS = 0.5;

export function distributePorts(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  resolvePorts?: PortResolver,
): void {
  // Group every edge endpoint by (nodeId, side). Endpoints not anchored
  // on any side (e.g. ghost edges with custom positions) are skipped.
  // The `#` separator is safe because karasu's identifier grammar (parser
  // accepts kebab/camel/snake) does not allow `#` in node IDs, and
  // qualified ghost-system IDs use `.` as the separator.
  const groups = new Map<string, Anchor[]>();

  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    const from = layoutNodes.get(edge.from);
    const to = layoutNodes.get(edge.to);
    if (!from || !to) continue;

    const fromSide = detectSide(edge.fromPoint, from);
    if (fromSide) push(groups, `${edge.from}#${fromSide}`, { edge, isFrom: true });
    const toSide = detectSide(edge.toPoint, to);
    if (toSide) push(groups, `${edge.to}#${toSide}`, { edge, isFrom: false });
  }

  for (const [key, anchors] of groups) {
    const hashIdx = key.lastIndexOf("#");
    const nodeId = key.slice(0, hashIdx);
    const side = key.slice(hashIdx + 1) as Side;
    const node = layoutNodes.get(nodeId);
    if (!node) continue;

    const ports = resolvePorts?.(node);
    // A lone edge on a plain rectangle already sits where it belongs: leaving
    // it alone keeps every existing box-only diagram byte-identical.
    if (anchors.length < 2 && !ports) continue;

    sortByOppositeDirection(anchors, side);

    const frame = ports?.frame ?? BBOX_PORT_FRAME;
    // Chrome keep-outs only apply to a fan. Moving a *lone* port sideways buys
    // a few pixels of clearance from a chip and pays for it with a slanted
    // edge in a diagram whose language is right angles — the edges in a fan are
    // already diagonal, so there the same move costs nothing. The shape's own
    // spans are not optional either way: they are where the outline is.
    const keepOuts = anchors.length > 1 ? (ports?.keepOuts ?? []) : [];
    const N = anchors.length;
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / (N + 1);
      const port = portPoint(node, side, t, frame, keepOuts);
      if (anchors[i].isFrom) {
        anchors[i].edge.fromPoint = port;
      } else {
        anchors[i].edge.toPoint = port;
      }
    }
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * The side of `node` an anchor sits on, or null when it sits on none. Exported
 * for the bundling pass, which slides a nudge along the side an endpoint is
 * anchored to instead of off it (#2477).
 */
export function detectSide(point: { x: number; y: number }, node: AnchorRect): Side | null {
  const left = node.x;
  const right = node.x + node.width;
  const top = node.y;
  const bottom = node.y + node.height;
  // Detect axis-aligned anchors. Prefer top/bottom over left/right when a
  // corner is exactly hit (none of karasu's current anchor logic produces
  // corners, but the precedence keeps the routing intuitive).
  if (
    Math.abs(point.y - top) < SIDE_EPS &&
    point.x >= left - SIDE_EPS &&
    point.x <= right + SIDE_EPS
  ) {
    return "top";
  }
  if (
    Math.abs(point.y - bottom) < SIDE_EPS &&
    point.x >= left - SIDE_EPS &&
    point.x <= right + SIDE_EPS
  ) {
    return "bottom";
  }
  if (
    Math.abs(point.x - left) < SIDE_EPS &&
    point.y >= top - SIDE_EPS &&
    point.y <= bottom + SIDE_EPS
  ) {
    return "left";
  }
  if (
    Math.abs(point.x - right) < SIDE_EPS &&
    point.y >= top - SIDE_EPS &&
    point.y <= bottom + SIDE_EPS
  ) {
    return "right";
  }
  return null;
}

function sortByOppositeDirection(anchors: Anchor[], side: Side): void {
  anchors.sort((a, b) => {
    const aOpp = a.isFrom ? a.edge.toPoint : a.edge.fromPoint;
    const bOpp = b.isFrom ? b.edge.toPoint : b.edge.fromPoint;
    if (side === "top" || side === "bottom") {
      if (aOpp.x !== bOpp.x) return aOpp.x - bOpp.x;
      return aOpp.y - bOpp.y;
    }
    if (aOpp.y !== bOpp.y) return aOpp.y - bOpp.y;
    return aOpp.x - bOpp.x;
  });
}
