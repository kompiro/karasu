/**
 * Port distribution for edges that share a node side (Phase 3 of #968 — see
 * ADR-20260429-01 and Issue #996).
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
 * Run before `routeOrthogonalEdges` so the channel routing uses the
 * distributed ports.
 */
import type { LayoutEdge, LayoutNode } from "./layout.js";

type Side = "top" | "bottom" | "left" | "right";

interface Anchor {
  edge: LayoutEdge;
  isFrom: boolean;
}

const SIDE_EPS = 0.5;

export function distributePorts(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
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
    if (anchors.length < 2) continue;
    const hashIdx = key.lastIndexOf("#");
    const nodeId = key.slice(0, hashIdx);
    const side = key.slice(hashIdx + 1) as Side;
    const node = layoutNodes.get(nodeId);
    if (!node) continue;

    sortByOppositeDirection(anchors, side);

    const N = anchors.length;
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / (N + 1);
      const port = portFor(node, side, t);
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

function detectSide(point: { x: number; y: number }, node: LayoutNode): Side | null {
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

function portFor(node: LayoutNode, side: Side, t: number): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: node.x + node.width * t, y: node.y };
    case "bottom":
      return { x: node.x + node.width * t, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height * t };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height * t };
  }
}
