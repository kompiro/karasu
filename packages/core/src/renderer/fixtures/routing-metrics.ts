// The penetration measure the routing fences share (TPL-1927): an edge must not
// cross the interior of a card it does not end on, nor of a group frame neither
// endpoint sits in. `routing-parity.test.ts` holds it on chosen models and
// `routing-corpus.test.ts` on every view of every example; one implementation,
// so the two cannot drift into measuring different things (TPL-2810).

import { countPolylinePenetrations, type Rect, type Point } from "../edge-geometry.js";
import type { LayoutEdge, LayoutNode, LayoutResult } from "../layout-types.js";

/**
 * Frames as the rects they actually cover. A boundary frame widened to reach an
 * out-of-band member (#2179) is a rectilinear polygon, and measuring its
 * *bounding box* would both invent penetrations across rows it does not enclose
 * and hide the strip it does.
 */
export function framesOf(res: LayoutResult): { id: string; pieces: Rect[] }[] {
  return res.containers
    .filter((c) => c.group)
    .map((c) => ({
      id: c.id,
      pieces: [...(c.coverage ?? [{ x: c.x, y: c.y, width: c.width, height: c.height }])],
    }));
}

export function framesOfNode(
  n: LayoutNode | undefined,
  frames: { id: string; pieces: Rect[] }[],
): Set<string> {
  const out = new Set<string>();
  if (!n) return out;
  for (const f of frames) {
    for (const p of f.pieces) {
      const inside =
        n.x >= p.x &&
        n.x + n.width <= p.x + p.width &&
        n.y >= p.y &&
        n.y + n.height <= p.y + p.height;
      if (inside) {
        out.add(f.id);
        break;
      }
    }
  }
  return out;
}

/**
 * Obstacles an edge must never cross: every card but the two it ends on, and
 * the frames neither endpoint is in. The endpoints are excluded as the cards
 * themselves, not by id: the multi-system root can draw two cards named `Api`,
 * and an edge into one of them must still count the other.
 */
export function obstaclesForEdge(
  ends: readonly [LayoutNode, LayoutNode],
  nodes: LayoutNode[],
  frames: { id: string; pieces: Rect[] }[],
  fFrom: Set<string>,
  fTo: Set<string>,
): Rect[] {
  return [
    ...nodes.filter((n) => n !== ends[0] && n !== ends[1]),
    ...frames.filter((f) => !fFrom.has(f.id) && !fTo.has(f.id)).flatMap((f) => f.pieces),
  ];
}

export function pointsOf(e: LayoutEdge): Point[] {
  return [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
}

/**
 * A card by the id an edge endpoint names. Deploy keys its Map by that id
 * (`<container>::<unit>`); the multi-system root keys it by (system, id) and
 * keeps the bare id on the card (#2917), so fall back to a search by `id`, and
 * then by dotted path, which is how a cross-system edge names a card in
 * another system (`PaymentGateway.PaymentService`).
 */
export function nodeOf(res: LayoutResult, id: string): LayoutNode | undefined {
  return (
    res.nodes.get(id) ??
    [...res.nodes.values()].find((n) => n.id === id) ??
    [...res.nodes.values()].find((n) => n.path?.join(".") === id)
  );
}

/**
 * The two cards an edge ends on. The multi-system root stamps each in-frame
 * edge with the Map keys of its endpoints (#2934), which name one card where
 * the bare id may name two; every other edge is resolved by `nodeOf`.
 */
export function endpointsOf(
  res: LayoutResult,
  e: LayoutEdge,
): [LayoutNode | undefined, LayoutNode | undefined] {
  const end = (key: string | undefined, id: string) =>
    (key !== undefined ? res.nodes.get(key) : undefined) ?? nodeOf(res, id);
  return [end(e.fromKey, e.from), end(e.toKey, e.to)];
}

export function totalPenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const [from, to] = endpointsOf(res, e);
    if (!from || !to) continue;
    const obstacles = obstaclesForEdge(
      [from, to],
      nodes,
      frames,
      framesOfNode(from, frames),
      framesOfNode(to, frames),
    );
    total += countPolylinePenetrations(pointsOf(e), obstacles);
  }
  return total;
}
