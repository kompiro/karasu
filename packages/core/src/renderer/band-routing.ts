/**
 * What the routing chain does with ghosts now that the ghost band (#2823)
 * places cross-domain ghost entities and cross-service ghost domains in rows
 * above and below the focus frame.
 *
 * A **band edge** (a ghost entity or ghost domain relation) goes through the
 * routing chain like any other edge and keeps only its muted drawing. Every
 * other ghost edge (ghost users, ghost systems) and every cyclic edge stays
 * peripheral: the passes leave it as the straight line it was drawn with.
 *
 * A **band card** counts as a card of a row, so the channels between the focus
 * frame and the band are measured against it. Ghost user and ghost system
 * cards stay out of the rows, as before.
 */
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

/** Whether the routing passes leave this edge as drawn (a ghost outside the band, or a cycle). */
export function isPeripheralEdge(edge: LayoutEdge): boolean {
  return edge.cyclic === true || (edge.ghost === true && edge.band !== true);
}

/** Whether this card is one a row of the canvas is measured with. */
export function isRowCard(node: LayoutNode): boolean {
  return node.ghost !== true || node.ghostBand !== undefined;
}

/**
 * Which edges a pass of the routing chain may move, and which cards bound its
 * rows (#3881). The chain runs twice when a canvas has a ghost band:
 *
 * 1. {@link CANVAS_PHASE}: every edge but the band's, exactly as a canvas
 *    without a band is routed. The focus frame's own routes, and the room
 *    `layout()` reserves from them, never depend on the band.
 * 2. {@link BAND_PHASE}: the band's edges only. The canvas's routes are fixed
 *    occupants: they claim their corridors, keep their lanes and ports, and the
 *    band edges take what is left. Band cards count as rows here, so the
 *    channels between the focus frame and the band exist.
 */
export interface RoutingPhase {
  /** Whether this pass may change the edge's route (it is still an occupant either way). */
  routes(edge: LayoutEdge): boolean;
  /** Whether this card bounds a row and the channels next to it. */
  rowCard(node: LayoutNode): boolean;
}

export const CANVAS_PHASE: RoutingPhase = {
  routes: (edge) => !isPeripheralEdge(edge),
  rowCard: (node) => node.ghost !== true,
};

export const BAND_PHASE: RoutingPhase = {
  routes: (edge) => edge.band === true && edge.cyclic !== true,
  rowCard: isRowCard,
};

/** The edges of a layout without the band's: what the canvas's own reservations are measured on. */
export function withoutBandEdges<T extends { edges: LayoutEdge[] }>(result: T): T {
  return result.edges.some((e) => e.band === true)
    ? { ...result, edges: result.edges.filter((e) => e.band !== true) }
    : result;
}

/** How close two ports on one side may sit before a band port moves off a held one. */
const PORT_CLEARANCE = 12;

/**
 * Move each band edge's port off any port a held (canvas) edge already uses on
 * the same side of the same card, to the middle of the widest free stretch of
 * that side (#3881). Runs after `distributePorts` spread the band's own ports
 * and before any route is built, so only the two endpoints move.
 */
export function clearHeldPorts(
  nodes: ReadonlyMap<string, LayoutNode>,
  band: readonly LayoutEdge[],
  held: readonly LayoutEdge[],
): void {
  type Side = "top" | "bottom" | "left" | "right";
  const sideOf = (n: LayoutNode, p: { x: number; y: number }): Side | undefined =>
    Math.abs(p.y - n.y) < 0.5
      ? "top"
      : Math.abs(p.y - (n.y + n.height)) < 0.5
        ? "bottom"
        : Math.abs(p.x - n.x) < 0.5
          ? "left"
          : Math.abs(p.x - (n.x + n.width)) < 0.5
            ? "right"
            : undefined;
  const along = (side: Side, p: { x: number; y: number }) =>
    side === "top" || side === "bottom" ? p.x : p.y;
  // Every port in use per card side: the held ones first, band ones as they settle.
  const used = new Map<string, number[]>();
  const key = (id: string, side: Side) => `${id}\u0000${side}`;
  const note = (id: string, p: { x: number; y: number }) => {
    const n = nodes.get(id);
    const side = n && sideOf(n, p);
    if (!n || !side) return;
    const k = key(id, side);
    used.set(k, [...(used.get(k) ?? []), along(side, p)]);
  };
  for (const e of held) {
    note(e.from, e.fromPoint);
    note(e.to, e.toPoint);
  }
  const heldCards = new Set([...used.keys()]);
  for (const e of band) {
    for (const end of ["from", "to"] as const) {
      const id = end === "from" ? e.from : e.to;
      const p = end === "from" ? e.fromPoint : e.toPoint;
      const n = nodes.get(id);
      const side = n && sideOf(n, p);
      if (!n || !side || !heldCards.has(key(id, side))) continue;
      const k = key(id, side);
      const taken = used.get(k)!;
      const at = along(side, p);
      if (!taken.some((t) => Math.abs(t - at) < PORT_CLEARANCE)) {
        taken.push(at);
        continue;
      }
      const lo = side === "top" || side === "bottom" ? n.x : n.y;
      const hi = lo + (side === "top" || side === "bottom" ? n.width : n.height);
      const stops = [lo, ...[...taken].sort((a, b) => a - b), hi];
      let best = { mid: at, gap: -1 };
      for (let i = 0; i + 1 < stops.length; i++) {
        const gap = stops[i + 1] - stops[i];
        if (gap > best.gap) best = { mid: (stops[i] + stops[i + 1]) / 2, gap };
      }
      const moved =
        side === "top" || side === "bottom" ? { x: best.mid, y: p.y } : { x: p.x, y: best.mid };
      if (end === "from") e.fromPoint = moved;
      else e.toPoint = moved;
      taken.push(best.mid);
    }
  }
}
