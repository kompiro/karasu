/**
 * Parallel-edge bundling — separate edges that share a `(from, to)` pair so
 * their labels and arrows do not stack. See docs/design/parallel-edge-bundling.md
 * and Issue #1185.
 *
 * Two responsibilities:
 *
 * 1. Annotate every edge in a parallel group (N ≥ 2) with `bundleIndex` /
 *    `bundleSize`. The renderer uses these to slide labels along the edge so
 *    `t = (bundleIndex + 1) / (bundleSize + 1)` instead of the natural
 *    midpoint, keeping labels of parallel edges visually separated even when
 *    line geometry alone would not suffice.
 *
 * 2. For edges `distributePorts` left fully co-located, nudge `fromPoint` /
 *    `toPoint` perpendicular to the edge direction by
 *    `(i - (N-1)/2) * BUNDLE_GAP`. Edges it did spread keep their ports.
 *
 *    The test is the observable geometry — "this bundle is still stacked" —
 *    not a list of the categories that skip distribution. Ghost and cyclic
 *    edges skip it explicitly; an edge between two services **expanded in
 *    place** (ADR-1815 / ADR-1955) skips it silently, because an expanded
 *    service is an `ExpandedFrame` rather than a layout node and
 *    `distributePorts` drops any edge whose endpoint is not in `layoutNodes`.
 *    Keying on geometry covers that third case and whatever comes next
 *    (#2477).
 *
 * Grouping key is `(from, to)` only — kind (sync/async) is not split because
 * the visual collision is kind-agnostic and stroke style already
 * disambiguates the kinds within the bundle.
 *
 * Order inside a group is the input order of `layoutEdges`, which mirrors AST
 * appearance order. This keeps the pass deterministic and snapshot-stable.
 *
 * Run after `distributePorts` / `routeOrthogonalEdges` / `distributeChannelLanes`
 * so port and waypoint geometry are already finalized for the edges this pass
 * does not move.
 */
import type { LayoutEdge } from "./layout-types.js";

const BUNDLE_GAP = 12;

/** Same point to within sub-pixel noise from the port maths. */
function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

/**
 * True when every edge in the bundle still shares one geometry — the mark of
 * a bundle `distributePorts` never spread. Routed edges are excluded: an edge
 * carrying `waypoints` or riding an aggregation trunk owns a path a blind
 * endpoint nudge would tear it off.
 */
function isStacked(edges: LayoutEdge[]): boolean {
  const [first] = edges;
  return edges.every(
    (e) =>
      (e.waypoints === undefined || e.waypoints.length === 0) &&
      e.trunkId === undefined &&
      samePoint(e.fromPoint, first.fromPoint) &&
      samePoint(e.toPoint, first.toPoint),
  );
}

export function markParallelBundles(layoutEdges: LayoutEdge[]): void {
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of layoutEdges) {
    const key = `${edge.from}->${edge.to}`;
    const list = groups.get(key);
    if (list) {
      list.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  for (const [, edges] of groups) {
    const N = edges.length;
    if (N < 2) continue;
    const stacked = isStacked(edges);
    for (let i = 0; i < N; i++) {
      const edge = edges[i];
      edge.bundleIndex = i;
      edge.bundleSize = N;

      // These ports were never distributed, so the lines stack perfectly.
      // Nudge them perpendicular to the edge direction so they don't overdraw.
      if (stacked || edge.ghost || edge.cyclic) {
        const offset = (i - (N - 1) / 2) * BUNDLE_GAP;
        const dx = edge.toPoint.x - edge.fromPoint.x;
        const dy = edge.toPoint.y - edge.fromPoint.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          // Perpendicular unit vector, rotated +90° from edge direction.
          const px = -dy / len;
          const py = dx / len;
          edge.fromPoint = {
            x: edge.fromPoint.x + px * offset,
            y: edge.fromPoint.y + py * offset,
          };
          edge.toPoint = {
            x: edge.toPoint.x + px * offset,
            y: edge.toPoint.y + py * offset,
          };
        }
      }
    }
  }
}
