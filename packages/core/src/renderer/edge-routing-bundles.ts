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
 * 2. For ghost and cyclic edges (which `distributePorts` skips and so leaves
 *    fully co-located), nudge `fromPoint` / `toPoint` perpendicular to the
 *    edge direction by `(i - (N-1)/2) * BUNDLE_GAP`. Regular edges have
 *    already been spread by `distributePorts` so this pass leaves their port
 *    positions alone.
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
    for (let i = 0; i < N; i++) {
      const edge = edges[i];
      edge.bundleIndex = i;
      edge.bundleSize = N;

      // Ghost/cyclic edges were skipped by `distributePorts`, so their
      // fromPoint/toPoint stack perfectly. Nudge them perpendicular to the
      // edge direction so the lines don't overdraw.
      if (edge.ghost || edge.cyclic) {
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
