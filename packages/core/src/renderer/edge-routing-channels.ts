/**
 * Channel-based orthogonal routing for skip-layer edges.
 *
 * For an edge whose straight-line segment would visually cross an unrelated
 * node card, replace it with an L-shape that descends in src's column,
 * traverses an inter-row channel just above the target row, and drops into
 * the target's column. Same-layer and adjacent-row edges keep their straight
 * lines (set no waypoints).
 *
 * See docs/design/auto-layout-edge-routing-orthogonal.md for the full design
 * (Phase 2). Phase 3 — port distribution and lane allocation when many edges
 * share a side or channel — is out of scope here.
 *
 * Out of scope (per design): ghost edges and cyclic edges are skipped; they
 * keep the existing straight-line rendering so back-arc styling and ghost
 * anchor logic are not disturbed.
 */
import type { LayoutEdge, LayoutNode } from "./layout.js";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

export function routeOrthogonalEdges(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
): void {
  const nodes = [...layoutNodes.values()];

  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    if (edge.waypoints && edge.waypoints.length > 0) continue;

    const from = layoutNodes.get(edge.from);
    const to = layoutNodes.get(edge.to);
    if (!from || !to) continue;

    // Only consider top-to-bottom (downward) edges. Same-layer and reverse
    // edges already use side anchors via computeEdgePoints.
    if (!isDownwardEdge(edge.fromPoint, edge.toPoint, from, to)) continue;

    const obstacles = nodes.filter((n) => n.id !== edge.from && n.id !== edge.to);
    if (!segmentCrossesAnyRect(edge.fromPoint, edge.toPoint, obstacles)) continue;

    // Channel sits in the gap between the previous row and the target row.
    // Use the upper edge of the target's bounding box and back off by half
    // the row gap above. We approximate the gap as (to.y - max-bottom-of-
    // intermediate-or-source-row).
    const channelY = computeChannelY(from, to, nodes);
    if (channelY === null) continue;

    edge.waypoints = [
      { x: edge.fromPoint.x, y: channelY },
      { x: edge.toPoint.x, y: channelY },
    ];
  }
}

function isDownwardEdge(
  fromPoint: Point,
  toPoint: Point,
  from: LayoutNode,
  to: LayoutNode,
): boolean {
  // The downstream edge attaches at from.bottom and to.top when
  // computeEdgePoints decides the edge crosses layers downward.
  const fromBottom = from.y + from.height;
  const toTop = to.y;
  if (fromBottom > toTop) return false;
  if (fromPoint.y < from.y + from.height - 0.5) return false;
  if (toPoint.y > to.y + 0.5) return false;
  return true;
}

/**
 * Compute the y-coordinate of the channel just above the target row. We pick
 * the midpoint between the target's top and the largest `y + height` of any
 * other node strictly above the target. This keeps the channel inside the
 * empty band that always exists between rows in the Sugiyama layout.
 */
function computeChannelY(from: LayoutNode, to: LayoutNode, nodes: LayoutNode[]): number | null {
  let upperBottom = from.y + from.height;
  for (const n of nodes) {
    if (n.id === from.id || n.id === to.id) continue;
    const bottom = n.y + n.height;
    // "above the target" means the node ends above the target's top.
    if (bottom <= to.y && bottom > upperBottom) {
      upperBottom = bottom;
    }
  }
  if (upperBottom >= to.y) return null;
  return (upperBottom + to.y) / 2;
}

function segmentCrossesAnyRect(a: Point, b: Point, rects: Rect[]): boolean {
  for (const r of rects) {
    if (segmentCrossesRect(a, b, r)) return true;
  }
  return false;
}

/**
 * Liang-Barsky line clipping against an axis-aligned rectangle. Returns true
 * if the open segment (a, b) intersects the rectangle's interior. Touching an
 * edge does not count — endpoints sitting exactly on a node side are not
 * treated as crossings (they're the legitimate from/to anchors).
 */
function segmentCrossesRect(a: Point, b: Point, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  // Strict interior: require positive overlap (not just touching).
  return t1 - t0 > 1e-6;
}
