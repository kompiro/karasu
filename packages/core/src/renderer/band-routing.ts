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
  /** Whether the edge's route is still sound after a move; a move that is not is undone. */
  accept: (edge: LayoutEdge) => boolean = () => true,
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
      const stops = [lo, ...[...taken].sort((x, y) => x - y), hi];
      // The middle of every free stretch, widest first.
      const mids = stops
        .slice(0, -1)
        .map((t, i) => ({ mid: (t + stops[i + 1]) / 2, gap: stops[i + 1] - t }))
        .filter((g) => g.gap >= 2 * PORT_CLEARANCE)
        .sort((x, y) => y.gap - x.gap)
        .map((g) => g.mid);
      const before = { from: e.fromPoint, to: e.toPoint, wps: e.waypoints?.map((w) => ({ ...w })) };
      const place = (mid: number) => {
        const moved = side === "top" || side === "bottom" ? { x: mid, y: p.y } : { x: p.x, y: mid };
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
      };
      // A fresh copy each time: the next `place` edits the waypoints in place.
      const restore = () => {
        e.fromPoint = before.from;
        e.toPoint = before.to;
        e.waypoints = before.wps?.map((w) => ({ ...w }));
      };
      // A move is kept only where the route it leaves behind is still sound.
      const settled = mids.find((mid) => {
        place(mid);
        if (accept(e)) return true;
        restore();
        return false;
      });
      taken.push(settled ?? at);
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
  /**
   * The focus frame and the frames between it and `outer`: a band edge leaves
   * them all, so its gutters run beyond the outermost of them.
   */
  inner: readonly ContainerRect[];
  /** Ghost system frames beside `outer`, kept clear of it as `outer` grows. */
  beside: readonly ContainerRect[];
}

export const NO_BAND: BandRouting = {
  frames: [],
  outer: undefined,
  titles: [],
  inner: [],
  beside: [],
};

/** The title text box a frame draws (`renderContainer`: 12px bold at x + 12, baseline y + 18). */
export function frameTitleBox(frame: ContainerRect): Rect {
  return {
    x: frame.x + 12,
    y: frame.y + 4,
    width: estimateTextWidth(frame.label, (CHAR_WIDTH * 12) / 13) + 4,
    height: 18,
  };
}

/**
 * The band routing inputs of a single-system canvas. A band whose groups are all
 * single cards has no frame of its own, but its edges are routed all the same,
 * so the titles and the frame around the band are given whatever the frames.
 * The band phase does nothing on a canvas without band edges.
 */
export function bandRoutingOf(containers: readonly ContainerRect[]): BandRouting {
  if (containers.length === 0) return NO_BAND;
  const nest = containers.filter((c) => c.ghostBand === undefined && c.group !== true);
  const focus = nest.find((c) => !c.ghost) ?? nest[0];
  const around = (c: ContainerRect) => c === focus || contains(c, focus);
  return {
    inner: nest.filter((c) => around(c) && (c !== containers[0] || c === focus)),
    beside: nest.filter((c) => c.ghost && !around(c)),
    frames: containers.filter((c) => c.ghostBand !== undefined),
    // Only a frame around the focus grows: on a canvas whose one frame is the
    // focus, the band already sits outside it.
    outer: containers[0].ghost ? containers[0] : undefined,
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

const contains = (f: Rect, n: Rect) =>
  n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height;

const pathOf = (e: LayoutEdge) => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];

/**
 * Whether `edge` runs along a stretch of any of `others` (same axis, same line,
 * overlapping), other than a sibling of its lane bundle.
 */
export function sharesStretch(edge: LayoutEdge, others: readonly LayoutEdge[]): boolean {
  const segs = (e: LayoutEdge) => {
    const pts = pathOf(e);
    return pts.slice(0, -1).flatMap((a, i) => {
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6)
        return [{ v: true, at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) }];
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6)
        return [{ v: false, at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }];
      return [];
    });
  };
  const mine = segs(edge);
  // A lane bundle's siblings draw one spine on purpose (#2958).
  const sibling = (o: LayoutEdge) =>
    (edge.trunkId !== undefined && o.trunkId === edge.trunkId) ||
    (edge.outTrunkId !== undefined && o.outTrunkId === edge.outTrunkId);
  return others.some(
    (o) =>
      o !== edge &&
      !sibling(o) &&
      segs(o).some((s) =>
        mine.some(
          (m) =>
            m.v === s.v &&
            Math.abs(m.at - s.at) < 1e-6 &&
            Math.min(m.hi, s.hi) - Math.max(m.lo, s.lo) > 1e-6,
        ),
      ),
  );
}

/**
 * Undo a band route the interior channel-L laid on a held route's stretch
 * (#3881): that candidate checks cards and frames, not the canvas's routes, so
 * the edge is handed back to the later candidates, which claim around them.
 */
export function dropRoutesOnHeld(band: readonly LayoutEdge[], held: readonly LayoutEdge[]): void {
  for (const e of band) {
    if (e.waypoints && e.waypoints.length > 0 && sharesStretch(e, held)) e.waypoints = undefined;
  }
}

/**
 * Keep each ghost system frame beside `outer` as far from it as before `outer`
 * grew around the band's routes (#3881): a frame on the left moves left by what
 * `outer` grew on the left, one on the right by what it grew on the right, with
 * the cards in it and the ends of the edges on those cards.
 */
export function keepBesideClear(
  before: Rect,
  band: BandRouting,
  nodes: ReadonlyMap<string, LayoutNode>,
  edges: readonly LayoutEdge[],
): void {
  const outer = band.outer;
  if (!outer) return;
  const left = before.x - outer.x;
  const right = outer.x + outer.width - (before.x + before.width);
  if (left <= 0 && right <= 0) return;
  for (const frame of band.beside) {
    const dx =
      frame.x + frame.width <= before.x ? -left : frame.x >= before.x + before.width ? right : 0;
    if (dx === 0) continue;
    const cards = [...nodes.values()].filter((n) => contains(frame, n));
    const ids = new Set(cards.map((n) => n.id));
    frame.x += dx;
    for (const n of cards) n.x += dx;
    for (const e of edges) {
      if (ids.has(e.from)) e.fromPoint = { x: e.fromPoint.x + dx, y: e.fromPoint.y };
      if (ids.has(e.to)) e.toPoint = { x: e.toPoint.x + dx, y: e.toPoint.y };
    }
  }
}

/**
 * Move each inner run of a band route that lies on a frame border, or within
 * half a lane of one, to a lane's distance off it (#3881): a muted line on a
 * border reads as the border. The router places a channel run midway between
 * rows, and a frame border can fall on that line. Tries one lane, then two, on
 * either side; a move the route is not sound after is undone.
 */
export function liftOffBorders(
  band: readonly LayoutEdge[],
  frames: readonly Rect[],
  pitch: number,
  accept: (edge: LayoutEdge) => boolean,
  others: readonly LayoutEdge[] = band,
): void {
  // A lane's distance off every parallel run of another edge, as the lane pass keeps.
  const roomy = (e: LayoutEdge, v: boolean, c: number, lo: number, hi: number) =>
    others.every((o) => {
      if (o === e) return true;
      const pts = pathOf(o);
      return pts.slice(0, -1).every((p, j) => {
        const q = pts[j + 1];
        const ov = Math.abs(p.x - q.x) < 1e-6;
        if (ov !== v || (!ov && Math.abs(p.y - q.y) > 1e-6)) return true;
        const oat = v ? p.x : p.y;
        const [olo, ohi] = v
          ? [Math.min(p.y, q.y), Math.max(p.y, q.y)]
          : [Math.min(p.x, q.x), Math.max(p.x, q.x)];
        return Math.min(hi, ohi) <= Math.max(lo, olo) || Math.abs(oat - c) >= pitch - 1e-6;
      });
    });
  const borders = frames.flatMap((f) => [
    { v: true, at: f.x, lo: f.y, hi: f.y + f.height },
    { v: true, at: f.x + f.width, lo: f.y, hi: f.y + f.height },
    { v: false, at: f.y, lo: f.x, hi: f.x + f.width },
    { v: false, at: f.y + f.height, lo: f.x, hi: f.x + f.width },
  ]);
  for (const e of band) {
    const wps = e.waypoints;
    if (!wps) continue;
    for (let i = 0; i + 1 < wps.length; i++) {
      const [a, b] = [wps[i], wps[i + 1]];
      const v = Math.abs(a.x - b.x) < 1e-6;
      if (!v && Math.abs(a.y - b.y) > 1e-6) continue;
      const at = v ? a.x : a.y;
      const [lo, hi] = v
        ? [Math.min(a.y, b.y), Math.max(a.y, b.y)]
        : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const on = borders.find(
        (f) =>
          f.v === v && Math.abs(f.at - at) < pitch / 2 && Math.min(hi, f.hi) > Math.max(lo, f.lo),
      );
      if (!on) continue;
      const saved = [{ ...a }, { ...b }];
      const set = (c: number) => {
        wps[i] = v ? { x: c, y: a.y } : { x: a.x, y: c };
        wps[i + 1] = v ? { x: c, y: b.y } : { x: b.x, y: c };
      };
      const fit = [1, -1, 2, -2]
        .map((k) => on.at + k * pitch)
        .find((c) => {
          const onAnother = borders.some(
            (f) =>
              f.v === v &&
              Math.abs(f.at - c) < pitch / 2 &&
              Math.min(hi, f.hi) > Math.max(lo, f.lo),
          );
          if (onAnother || !roomy(e, v, c, lo, hi)) return false;
          set(c);
          return accept(e);
        });
      if (fit === undefined) {
        wps[i] = saved[0];
        wps[i + 1] = saved[1];
      }
    }
  }
}
