/**
 * Shared segment/rectangle geometry for the orthogonal edge routers
 * (`edge-routing-channels.ts` for the ungrouped skip-layer case,
 * `edge-routing-groups.ts` for the Group-by view). Kept in one module so both
 * routers — and the penetration assertions in their tests — use the exact same
 * strict-interior crossing test (TPL-1927: measure crossings *and*
 * node/frame penetrations from one definition).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Liang-Barsky line clipping against an axis-aligned rectangle. Returns true
 * if the open segment (a, b) intersects the rectangle's interior. Touching an
 * edge does not count — endpoints sitting exactly on a node/frame side are not
 * treated as crossings (they're legitimate from/to anchors or a stub running
 * along a side).
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
      // Segment is parallel to this rect edge. If q[i] <= 0 the segment lies
      // on or outside that edge — no strict-interior crossing on this axis.
      if (q[i] <= 0) return false;
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

export function segmentCrossesAnyRect(a: Point, b: Point, rects: Rect[]): boolean {
  for (const r of rects) {
    if (segmentCrossesRect(a, b, r)) return true;
  }
  return false;
}

/**
 * True if no segment of the polyline crosses any obstacle's interior — the
 * early-exit boolean companion to `countPolylinePenetrations`. Both share the
 * one strict-interior test (`segmentCrossesRect`), so the routers that decide a
 * route with this and the tests that assert penetration == 0 with the counter
 * can never disagree (TPL-1927).
 */
export function polylineClearOf(path: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (segmentCrossesAnyRect(path[i], path[i + 1], obstacles)) return false;
  }
  return true;
}

/**
 * Count strict-interior crossings of a polyline against a set of obstacle
 * rectangles. Shared by the routers' tests to assert **penetration == 0**
 * (TPL-1927). Every segment × every rect is counted, so callers pass
 * only the obstacles that should never be crossed (i.e. excluding the edge's
 * own endpoint nodes and their enclosing frames).
 */
export function countPolylinePenetrations(points: Point[], obstacles: Rect[]): number {
  let count = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const r of obstacles) {
      if (segmentCrossesRect(points[i], points[i + 1], r)) count++;
    }
  }
  return count;
}
