/**
 * Parallel-edge bundling — separate edges that share a `(from, to)` pair so
 * their labels and arrows do not stack. See ADR-1185 (Issue #1185) and
 * ADR-2477, which generalizes the nudge gate below.
 *
 * Two responsibilities:
 *
 * 1. Annotate every edge in a parallel group (N ≥ 2) with `bundleIndex` /
 *    `bundleSize`. The renderer uses these to slide labels along the edge so
 *    `t = (bundleIndex + 1) / (bundleSize + 1)` instead of the natural
 *    midpoint, keeping labels of parallel edges visually separated even when
 *    line geometry alone would not suffice.
 *
 * 2. Nudge every edge whose line is *still stacked* on another edge of the
 *    bundle perpendicular to the edge direction by `(i - (N-1)/2) * BUNDLE_GAP`.
 *    The test is the co-location itself, not the list of categories that
 *    produce it (#2477): ghost and cyclic edges are stacked because
 *    `distributePorts` skips them by kind, and a frame-anchored edge is stacked
 *    because that pass looks its endpoints up in `layoutNodes` and an in-place
 *    expanded service is an `ExpandedFrame`, not a layout node (ADR-1815 /
 *    ADR-1955 postdate ADR-1185). An edge that `distributePorts` did spread
 *    keeps the ports it was given.
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
    // Decided up front, because the nudges below are what stop the edges being
    // co-located — asking mid-loop would let the first move exempt the rest.
    const stacked = edges.map((edge) => isStacked(edge, edges));
    for (let i = 0; i < N; i++) {
      const edge = edges[i];
      edge.bundleIndex = i;
      edge.bundleSize = N;

      // Ghost/cyclic keep their historical guarantee even where their anchor
      // logic left the lines apart; anything else moves only while it is still
      // drawn on top of a sibling.
      if (!edge.ghost && !edge.cyclic && !stacked[i]) continue;

      const offset = (i - (N - 1) / 2) * BUNDLE_GAP;
      const dx = edge.toPoint.x - edge.fromPoint.x;
      const dy = edge.toPoint.y - edge.fromPoint.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      // Perpendicular unit vector, rotated +90° from edge direction.
      const px = (-dy / len) * offset;
      const py = (dx / len) * offset;
      // The whole polyline travels, so a routed edge keeps its shape (and its
      // corridors keep clear of what the router steered it around) instead of
      // gaining a kink at each end.
      edge.fromPoint = { x: edge.fromPoint.x + px, y: edge.fromPoint.y + py };
      edge.toPoint = { x: edge.toPoint.x + px, y: edge.toPoint.y + py };
      if (edge.waypoints) {
        edge.waypoints = edge.waypoints.map((p) => ({ x: p.x + px, y: p.y + py }));
      }
    }
  }
}

/** Sub-pixel apart is drawn on top of; a whole pixel reads as two lines. */
const COLOCATED_EPS = 0.5;

/** Whether another edge of the bundle is drawn on `edge`'s line, point for point. */
function isStacked(edge: LayoutEdge, bundle: LayoutEdge[]): boolean {
  return bundle.some((other) => other !== edge && samePolyline(edge, other));
}

function samePolyline(a: LayoutEdge, b: LayoutEdge): boolean {
  const aWaypoints = a.waypoints ?? [];
  const bWaypoints = b.waypoints ?? [];
  if (aWaypoints.length !== bWaypoints.length) return false;
  return (
    samePoint(a.fromPoint, b.fromPoint) &&
    samePoint(a.toPoint, b.toPoint) &&
    aWaypoints.every((p, i) => samePoint(p, bWaypoints[i]))
  );
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < COLOCATED_EPS && Math.abs(a.y - b.y) < COLOCATED_EPS;
}
