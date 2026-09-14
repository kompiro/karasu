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
