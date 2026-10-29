/**
 * Group-frame geometry shared by the routers, the lane passes and the obstacle
 * index (#2790).
 *
 * Two questions, both about frames rather than about routing: **what rects does
 * a frame actually cover**, and **which frames enclose a given card**. They live
 * in a module of their own because the obstacle index needs both while the
 * router needs the index, so keeping them in `edge-routing-groups.ts` would
 * close a cycle between the two.
 */
import type { Point } from "./edge-geometry.js";
import type { ContainerRect, LayoutNode, Rect } from "./layout-types.js";

/**
 * The rects a frame occupies: its `coverage` when it was widened (#2179), else
 * the recorded rect. Routing must use these — an L-shaped frame's bounding box
 * spans rows it does not enclose, and treating that box as an obstacle would
 * push edges around empty space.
 */
export function framePieces(frame: ContainerRect): readonly Rect[] {
  return frame.coverage ?? [frame];
}

/**
 * The frame as the renderer draws it: the border it is stroked along, as a
 * closed polyline (the first corner repeated last), and the rects that border
 * encloses. A widened frame whose {@link framePieces} trace one polygon is
 * drawn as that outline (a `<path>` from {@link rectUnionOutline}); any other
 * frame is drawn as its plain `<rect>`, and then encloses only that rect. One
 * decision answers both, so a pass that avoids this line and tests "inside"
 * against these rects agrees with what the canvas shows.
 */
export function drawnFrame(frame: ContainerRect): { outline: Point[]; pieces: readonly Rect[] } {
  const corners = frame.coverage ? rectUnionOutline(frame.coverage) : null;
  if (corners !== null) return { outline: [...corners, corners[0]], pieces: framePieces(frame) };
  const { x, y, width, height } = frame;
  return {
    outline: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ],
    pieces: [{ x, y, width, height }],
  };
}

/**
 * The corners of the outline of a union of axis-aligned rects (#2179), in
 * drawing order: the tops left-to-right, then the bottoms right-to-left.
 *
 * A frame that reaches an out-of-band member is a rectilinear polygon, not a
 * rect. The union is built by **vertical slabs**: every distinct x becomes a
 * boundary, and each slab's vertical extent is the min/max over the rects
 * covering it. That is exact for the shapes `buildGroupFrames` produces, where
 * every strip shares an edge with the band body so each slab's coverage is one
 * contiguous interval — and it stays readable for any number of strips on either
 * side, which a hand-rolled L/T case analysis does not.
 *
 * Returns `null` for a single rect (nothing to union) and for a slab set that is
 * not contiguous, so the caller falls back to the plain rect rather than
 * tracing an outline that claims rows it does not cover.
 */
export function rectUnionOutline(rects: readonly Rect[]): Point[] | null {
  if (rects.length < 2) return null;
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  const slabs: { x1: number; x2: number; top: number; bottom: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const mid = (x1 + x2) / 2;
    const covering = rects.filter((r) => r.x <= mid && mid <= r.x + r.width);
    if (covering.length === 0) return null; // a gap along x — not one polygon
    const top = Math.min(...covering.map((r) => r.y));
    const bottom = Math.max(...covering.map((r) => r.y + r.height));
    // Contiguity: the covering rects must form one interval, or the outline
    // would fill a hole the frame does not actually cover.
    const sorted = [...covering].sort((a, b) => a.y - b.y);
    let reach = sorted[0].y + sorted[0].height;
    for (const r of sorted.slice(1)) {
      if (r.y > reach) return null;
      reach = Math.max(reach, r.y + r.height);
    }
    const prev = slabs[slabs.length - 1];
    if (prev && prev.x2 === x1 && prev.top === top && prev.bottom === bottom) prev.x2 = x2;
    else slabs.push({ x1, x2, top, bottom });
  }
  const points: Point[] = [];
  const push = (x: number, y: number): void => {
    const last = points[points.length - 1];
    // Adjacent slabs meet at a shared x, so the naive walk repeats the corner…
    if (last && last.x === x && last.y === y) return;
    // …and slabs that differ on only one side leave collinear points along the
    // other. Fold them so the outline lists corners, which is what a reader
    // diffing a snapshot of the drawn path wants to compare.
    const prev = points[points.length - 2];
    if (
      last &&
      prev &&
      ((prev.x === last.x && last.x === x) || (prev.y === last.y && last.y === y))
    ) {
      points[points.length - 1] = { x, y };
      return;
    }
    points.push({ x, y });
  };
  for (const s of slabs) {
    push(s.x1, s.top);
    push(s.x2, s.top);
  }
  for (const s of [...slabs].reverse()) {
    push(s.x2, s.bottom);
    push(s.x1, s.bottom);
  }
  return points;
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
 *
 * An in-place-expanded container (#1923) is an endpoint that is not a card, so
 * it gets an entry of its own: it belongs to its own boundary frame and to
 * nothing else, which is what lets an edge anchored on that frame leave it
 * without counting the frame as an obstacle.
 */
export function buildFramesOfNode(
  nodes: Iterable<LayoutNode>,
  frames: readonly ContainerRect[],
  expandedFrames?: ReadonlyMap<string, ContainerRect>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const n of nodes) {
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
  if (expandedFrames) {
    for (const [cid, rect] of expandedFrames) out.set(cid, new Set([rect.id]));
  }
  return out;
}
