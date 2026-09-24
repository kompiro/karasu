/**
 * Channel-based orthogonal routing for skip-layer edges.
 *
 * For an edge whose straight-line segment would visually cross an unrelated
 * node card, replace it with an L-shape that descends in src's column,
 * traverses an inter-row channel just above the target row, and drops into
 * the target's column. Same-layer and adjacent-row edges keep their straight
 * lines (set no waypoints).
 *
 * The candidate polyline is verified against obstacles before being applied:
 * if any of its three segments still crosses a node (e.g. when src.x or to.x
 * happens to align with an intermediate node card), routing is skipped and
 * the edge stays straight. Strictly monotonic — never makes a diagram worse.
 *
 * Performance: the obstacle set arrives as an `ObstacleQuery` (#2790), i.e. the
 * canvas indexed once per routing pass and asked for the obstacles near a
 * segment, rather than as a fresh `Rect[]` per edge walked in full. The exact
 * clip is unchanged, so the routes are.
 *
 * See docs/design/auto-layout-edge-routing-orthogonal.md for the full design
 * (Phase 2). Phase 3 — port distribution and lane allocation when many edges
 * share a side or channel, plus column-shifting when stubs are blocked — is
 * out of scope here.
 *
 * Out of scope (per design): ghost edges and cyclic edges are skipped; they
 * keep the existing straight-line rendering so back-arc styling and ghost
 * anchor logic are not disturbed.
 */
import type { LayoutEdge, LayoutNode } from "./layout-types.js";
import type { Point } from "./edge-geometry.js";
import type { ObstacleQuery } from "./obstacle-index.js";

export function routeOrthogonalEdges(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  /**
   * The obstacles this edge must not cross: every card but its own two
   * endpoints, plus the group frames neither endpoint belongs to (#2362).
   * Required rather than optional (#2790): the frame exemption is per-endpoint
   * and this module has no frame concept of its own, so a caller that forgot to
   * supply the set would silently route through frames (TPL-219). An ungrouped
   * canvas passes a query over the cards alone, which is exactly the ADR-968
   * behaviour.
   */
  obstaclesFor: (edge: LayoutEdge) => ObstacleQuery,
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

    const obstacles = obstaclesFor(edge);
    if (!obstacles.segmentCrosses(edge.fromPoint, edge.toPoint)) continue;

    // Channel sits in the gap between the previous row and the target row.
    // Use the upper edge of the target's bounding box and back off by half
    // the row gap above. We approximate the gap as (to.y - max-bottom-of-
    // intermediate-or-source-row).
    const channelY = computeChannelY(from, to, nodes);
    if (channelY === null) continue;

    const waypoints = [
      { x: edge.fromPoint.x, y: channelY },
      { x: edge.toPoint.x, y: channelY },
    ];

    // Validate the candidate L-shape: each segment must be obstacle-free.
    // The vertical stubs at src.x / to.x can still hit an intermediate node
    // when columns line up — in that case keep the original straight line.
    const path = [edge.fromPoint, ...waypoints, edge.toPoint];
    if (!obstacles.polylineClear(path)) continue;

    edge.waypoints = waypoints;
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
  // The 0.5 tolerance accommodates sub-pixel rounding from the layout pipeline.
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
