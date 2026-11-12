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

/** Obstacles an edge must never cross: non-endpoint cards + frames neither endpoint is in. */
export function obstaclesForEdge(
  e: LayoutEdge,
  nodes: LayoutNode[],
  frames: { id: string; pieces: Rect[] }[],
  fFrom: Set<string>,
  fTo: Set<string>,
): Rect[] {
  return [
    ...nodes.filter((n) => n.id !== e.from && n.id !== e.to),
    ...frames.filter((f) => !fFrom.has(f.id) && !fTo.has(f.id)).flatMap((f) => f.pieces),
  ];
}

export function pointsOf(e: LayoutEdge): Point[] {
  return [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
}

/**
 * A card by the id an edge endpoint names. Deploy keys its Map by that id
 * (`<container>::<unit>`); the multi-system root keys it by (system, id) and
 * keeps the bare id on the card (#2917), so fall back to a search by `id`.
 */
export function nodeOf(res: LayoutResult, id: string): LayoutNode | undefined {
  return res.nodes.get(id) ?? [...res.nodes.values()].find((n) => n.id === id);
}

export function totalPenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const from = nodeOf(res, e.from);
    const to = nodeOf(res, e.to);
    if (!from || !to) continue;
    const obstacles = obstaclesForEdge(
      e,
      nodes,
      frames,
      framesOfNode(from, frames),
      framesOfNode(to, frames),
    );
    total += countPolylinePenetrations(pointsOf(e), obstacles);
  }
  return total;
}
