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
import type { ContainerRect, LayoutEdge, LayoutNode, Rect } from "./layout-types.js";
import { CHAR_WIDTH, estimateTextWidth } from "./rendering-constants.js";

/** Whether the routing passes leave this edge as drawn (a ghost outside the band, or a cycle). */
export function isPeripheralEdge(edge: LayoutEdge): boolean {
  return edge.cyclic === true || (edge.ghost === true && edge.band !== true);
}

/** Whether this card is one a row of the canvas is measured with. */
function isRowCard(node: LayoutNode): boolean {
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
 * that side (#3881). Runs once after `distributePorts` spread the band's own
 * ports, and once more after the band's routes are built, since the candidate
 * passes re-anchor what they reroute: then the stub square to the side moves
 * with its port, so the route stays orthogonal.
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
      // A routed edge's stub off this side moves with its port, so it stays square.
      const wps = e.waypoints;
      const stub = wps && wps.length > 0 ? (end === "from" ? 0 : wps.length - 1) : undefined;
      if (stub !== undefined) {
        const w = wps![stub];
        const across = side === "top" || side === "bottom" ? w.x === p.x : w.y === p.y;
        if (across) {
          wps![stub] =
            side === "top" || side === "bottom" ? { x: moved.x, y: w.y } : { x: w.x, y: moved.y };
        }
      }
      if (end === "from") e.fromPoint = moved;
      else e.toPoint = moved;
      taken.push(best.mid);
    }
  }
}

/** What the band phase of the routing chain needs from the canvas's frames (#3881). */
export interface BandRouting {
  /** The band's frames: obstacles with the per-endpoint exemption. */
  frames: readonly ContainerRect[];
  /** The frame that encloses the band, grown to hold the band's routes. */
  outer: ContainerRect | undefined;
  /** The title text of every frame that is not the band's: obstacles to every band edge. */
  titles: readonly Rect[];
}

export const NO_BAND: BandRouting = { frames: [], outer: undefined, titles: [] };

/** The title text box a frame draws (`renderContainer`: 12px bold at x + 12, baseline y + 18). */
export function frameTitleBox(frame: ContainerRect): Rect {
  return {
    x: frame.x + 12,
    y: frame.y + 4,
    width: estimateTextWidth(frame.label, (CHAR_WIDTH * 12) / 13) + 4,
    height: 18,
  };
}

/** The band routing inputs of a single-system canvas: {@link NO_BAND} when it has no band. */
export function bandRoutingOf(containers: readonly ContainerRect[]): BandRouting {
  const frames = containers.filter((c) => c.ghostBand !== undefined);
  if (frames.length === 0) return NO_BAND;
  return {
    frames,
    outer: containers[0]?.ghostBand === undefined ? containers[0] : undefined,
    titles: containers
      .filter((c) => c.ghostBand === undefined && c.group !== true)
      .map(frameTitleBox),
  };
}

/** Grow `outer` so it holds every point of the band's routes, `margin` inside its border. */
export function growAroundBandRoutes(
  outer: ContainerRect | undefined,
  band: readonly LayoutEdge[],
  margin: number,
): void {
  if (!outer || band.length === 0) return;
  const pts = band.flatMap((e) => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint]);
  const minX = Math.min(...pts.map((p) => p.x)) - margin;
  const maxX = Math.max(...pts.map((p) => p.x)) + margin;
  const minY = Math.min(...pts.map((p) => p.y)) - margin;
  const maxY = Math.max(...pts.map((p) => p.y)) + margin;
  const right = Math.max(outer.x + outer.width, maxX);
  const bottom = Math.max(outer.y + outer.height, maxY);
  outer.x = Math.min(outer.x, minX);
  outer.y = Math.min(outer.y, minY);
  outer.width = right - outer.x;
  outer.height = bottom - outer.y;
}
