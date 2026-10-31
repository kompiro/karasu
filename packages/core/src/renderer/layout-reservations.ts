/**
 * Capacity reservations for the second placement pass (#2512, #3440): the
 * room `layout()` measures on the first placement and asks `layoutInner` to
 * open on the next one. Inter-row channels (#2608), columns through rows
 * (#2611) and the drill-down frame's sides (#3154) are each read from the
 * routed result, so a view whose routing already fits reserves nothing.
 */
import { channelLimitsOf, collectChannels, LANE_PITCH } from "./edge-routing-lanes.js";
import { TRUNK_LANE_GAP } from "./edge-routing-groups.js";
import { framePieces } from "./frame-geometry.js";
import type { LayoutNode, LayoutEdge, ContainerRect, LayoutResult } from "./layout-types.js";

/**
 * Extra gap each placement row needs above it so the channel there holds its
 * measured traffic at `LANE_PITCH` (#2608), keyed by row ordinal — the unit
 * `placeNodesInLayers` counts, sub-rows included, because collisions happen
 * between sub-rows too. Empty when every channel fits its default gap: the
 * threshold sits at "fits the current constant", the floor-first shape
 * ADR-2593 settled on, so a view that never needed the room is not grown.
 *
 * Inside a drill-down frame the channels above the first row and below the
 * last are bounded by the frame (#3132), and their room is the gap before row
 * 0 and the gap after the last row (ordinal `rows.length`). Growing either
 * grows the frame, which is drawn around the placed rows.
 */
export function channelReservations(
  result: LayoutResult,
  rows: readonly (readonly string[])[],
  enclosure: ContainerRect | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  if (rows.length === 0) return out;
  const rowTop = rows.map((row) =>
    row.reduce((top, id) => Math.min(top, result.nodes.get(id)?.y ?? Infinity), Infinity),
  );
  const frames = result.containers.filter((c) => c.group).flatMap(framePieces);
  const limits = channelLimitsOf(enclosure);
  for (const channel of collectChannels(result.nodes, result.edges, frames, limits)) {
    // A channel bounded on one side only (above the first row or below the
    // last, with no frame around the canvas) has no gap to grow; the lane
    // pass stacks its lanes away from the row instead.
    if (!Number.isFinite(channel.upper) || !Number.isFinite(channel.lower)) continue;
    const extra = channel.lanes * LANE_PITCH - (channel.lower - channel.upper);
    if (extra <= 0) continue;
    // The row the channel runs above: the first whose top is at or below the
    // band's floor (a frame's top may sit between the two). A row every member
    // of which left for a side column has no top (`Infinity`) and is not a
    // row the channel can run above. Below the last row, the frame's bottom
    // border is the floor and the gap is the one after the last row.
    let rowBelow = rowTop.findIndex((top) => Number.isFinite(top) && top >= channel.lower - 0.5);
    if (rowBelow === -1 && channel.lower === limits.floor) rowBelow = rows.length;
    // Above the first row only the gap between the frame's title strip and the
    // row itself grows. A ghost card up there, or beside the frame (the band
    // ignores x), is placed from the frame and does not move with the row.
    if (rowBelow < 0) continue;
    if (
      rowBelow === 0 &&
      (channel.upper !== limits.ceiling || Math.abs(rowTop[0] - channel.lower) > 0.5)
    ) {
      continue;
    }
    out.set(rowBelow, Math.max(out.get(rowBelow) ?? 0, extra));
  }
  return out;
}

/** Width to add inside the drill-down frame on each side (#3154). */
export interface FrameSides {
  left: number;
  right: number;
}

/**
 * Gap kept between the outermost gutter lane and the drill-down frame's side:
 * what the default padding leaves beside the first lane
 * (`CONTAINER_PADDING - GUTTER_GAP`).
 */
const FRAME_SIDE_MARGIN = 12;

/**
 * Extra width the drill-down frame needs on each side so every vertical run
 * stays inside it (#3154): the horizontal counterpart of the frame-bounded
 * channels (#3132). Gutter lanes step outward from the content by
 * `TRUNK_LANE_GAP`, while the frame's side padding is fixed before routing,
 * so from the second lane on they were drawn on or past the border.
 */
export function gutterReservations(
  result: LayoutResult,
  enclosure: ContainerRect | undefined,
): FrameSides | undefined {
  if (!enclosure) return undefined;
  const innerLeft = enclosure.x + FRAME_SIDE_MARGIN;
  const innerRight = enclosure.x + enclosure.width - FRAME_SIDE_MARGIN;
  let left = 0;
  let right = 0;
  for (const edge of result.edges) {
    if (edge.ghost || edge.cyclic) continue;
    const pts = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (Math.abs(a.x - b.x) > 1e-6) continue;
      left = Math.max(left, innerLeft - a.x);
      right = Math.max(right, a.x - innerRight);
    }
  }
  if (left <= 0.5 && right <= 0.5) return undefined;
  return { left: Math.ceil(Math.max(0, left)), right: Math.ceil(Math.max(0, right)) };
}

/**
 * Extra width each row needs inside it so the columns crossing it have lanes
 * to run in (#2611), keyed by row ordinal → the id of the card the width is
 * opened before. The horizontal counterpart of
 * {@link channelReservations}, measured the same way: what the routing chain
 * was observed to carry, against what the placement actually offers. Only the
 * gaps *between* two cards are widened, never a row's outer edges.
 *
 * **Traffic.** Every edge the chain sent out to an *outer* gutter although its
 * endpoints sit two or more rows apart is a column the interior could not
 * hold. Edges into one target share a column (the P2c-B trunk rule), so they
 * are counted once — one per target is what the reservation has to fit, and
 * counting one per edge measured +12% canvas on dify against +4% for the
 * shared count.
 *
 * **Capacity.** A row offers a lane every `TRUNK_LANE_GAP` inside each gap
 * between two neighbouring cards, plus the room beside its outer cards, minus
 * the lanes routes already took there. Reserving against the *free* capacity
 * rather than the total is what keeps a view that merely re-used its existing
 * gaps from growing at all.
 *
 * Empty when every row's free capacity already covers its traffic, so a view
 * that does not need a column is byte-identical — floor-first, as ADR-2593
 * settled and ADR-2598 kept.
 */
export function columnReservations(
  result: LayoutResult,
  rows: readonly (readonly string[])[],
): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  // Two rows have no row *between* them, so no column can be reserved.
  if (rows.length < 3) return out;
  // Grouped canvases are not offered interior corridors at all (the
  // `frames.length === 0` gate in `edge-routing-groups.ts` keeps ADR-1859's
  // guarantee), so a column opened here could never be used — and the second
  // placement pass it triggers would re-run the whole layout to produce the
  // same bytes.
  if (result.containers.some((c) => c.group)) return out;
  const cardsOfRow = rows.map((row) =>
    row
      .map((id) => result.nodes.get(id))
      .filter((n): n is LayoutNode => !!n && !n.ghost)
      .sort((a, b) => a.x - b.x),
  );
  if (cardsOfRow.some((cards) => cards.length === 0)) return out;
  const rowOf = new Map<string, number>();
  rows.forEach((row, r) => row.forEach((id) => rowOf.set(id, r)));
  const nodes = [...result.nodes.values()].filter((n) => !n.ghost);
  const minLeft = Math.min(...nodes.map((n) => n.x));
  const maxRight = Math.max(...nodes.map((n) => n.x + n.width));

  // Traffic: one column per target, spanning the rows strictly between the
  // endpoints' rows. `xs` collects where each member would have liked to run,
  // so the reservation is opened where the routes actually want it.
  const columns = new Map<string, { xs: number[]; lo: number; hi: number }>();
  for (const edge of result.edges) {
    if (edge.ghost || edge.cyclic) continue;
    if (!isOuterGutterRoute(edge, minLeft, maxRight)) continue;
    const from = result.nodes.get(edge.from);
    const to = result.nodes.get(edge.to);
    const rf = rowOf.get(edge.from);
    const rt = rowOf.get(edge.to);
    if (!from || !to || rf === undefined || rt === undefined) continue;
    if (Math.abs(rf - rt) < 2) continue;
    const ideal = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
    const lo = Math.min(rf, rt) + 1;
    const hi = Math.max(rf, rt) - 1;
    const column = columns.get(edge.to);
    if (column) {
      column.xs.push(ideal);
      column.lo = Math.min(column.lo, lo);
      column.hi = Math.max(column.hi, hi);
    } else columns.set(edge.to, { xs: [ideal], lo, hi });
  }
  if (columns.size === 0) return out;

  for (let r = 1; r < rows.length - 1; r++) {
    const wanted = [...columns.values()].filter((c) => c.lo <= r && r <= c.hi);
    if (wanted.length === 0) continue;
    const cards = cardsOfRow[r];
    // **One** column per short row, not the whole shortfall. Measured on the
    // dify corpus (20 views, 1,102 edges): opening one column where a row is
    // short takes 40.0% of the gutter routes into the interior, with
    // crossings −17.3%, route length −12.8% and canvas area −9.7% against
    // main. Opening the full shortfall takes more of them off the gutters
    // (51.8%) and is worse everywhere it counts — crossings −16.1%, length
    // −9.5%, area −9.2% — because every extra column widens the row it is in,
    // and each edge that follows it crosses the runs of the rows it now
    // passes. The first column is the one that pays: it turns "no way
    // through this row at all" into "a way through".
    const free = freeLanesAcrossRow(result, cards, minLeft, maxRight);
    const shortfall = Math.min(1, wanted.length - free);
    if (shortfall <= 0) continue;
    // Where: the mean of what the columns crossing this row were aiming at,
    // resolved to the card that follows it. An id, not the x itself — the
    // second pass re-centres every row, so an x measured on the first would
    // point somewhere else by the time it were applied (TPL-2611).
    const target =
      wanted.reduce((sum, c) => sum + c.xs.reduce((a, b) => a + b, 0) / c.xs.length, 0) /
      wanted.length;
    // Only *between* two cards. A column past either end of the row is not
    // reserved: the room beside a row's outer cards is already open to the
    // routing (it lanes there out to the content bounds), and widening a row
    // at its edge would be undone by the centring, which reads the cards.
    const after = cards.find((n) => n.x >= target);
    if (!after || after === cards[0]) continue;
    const slot = out.get(r) ?? new Map<string, number>();
    slot.set(after.id, shortfall * TRUNK_LANE_GAP);
    out.set(r, slot);
  }
  return out;
}

/**
 * Whether an edge runs along one of the outer gutters — its first vertical run
 * sits beyond the content on either side. The interior corridors and the
 * staircase routes both keep their verticals within the content, so this is
 * "the chain could not place this edge inside", stated on the route rather
 * than on the number of its waypoints (TPL-1954: a shape-counting test stops
 * seeing a shape the moment a new one is added).
 */
function isOuterGutterRoute(edge: LayoutEdge, minLeft: number, maxRight: number): boolean {
  const wps = edge.waypoints ?? [];
  const run = wps.find((w, i) => i + 1 < wps.length && Math.abs(w.x - wps[i + 1].x) < 1e-6);
  return run !== undefined && (run.x < minLeft || run.x > maxRight);
}

/**
 * Lanes a row can still offer a column: one every `TRUNK_LANE_GAP` inside each
 * gap between neighbouring cards and in the room beside the outer ones, less
 * the ones routes already run in over this row's band. Counted on the band
 * between the channels above and below the row, because that is the stretch a
 * column crossing the row has to be free over.
 */
function freeLanesAcrossRow(
  result: LayoutResult,
  cards: readonly LayoutNode[],
  minLeft: number,
  maxRight: number,
): number {
  const top = Math.min(...cards.map((n) => n.y));
  const bottom = Math.max(...cards.map((n) => n.y + n.height));
  let lanes = 0;
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < cards.length; i++) {
    spans.push([cards[i].x + cards[i].width, cards[i + 1].x]);
  }
  spans.push(
    [minLeft, cards[0].x],
    [cards[cards.length - 1].x + cards[cards.length - 1].width, maxRight],
  );
  for (const [left, right] of spans) {
    if (right - left >= TRUNK_LANE_GAP) lanes += Math.floor((right - left) / TRUNK_LANE_GAP);
  }
  // Verticals already crossing this row's band, wherever they run inside the
  // content: each one is a lane a new column cannot have.
  const taken = new Set<number>();
  for (const edge of result.edges) {
    if (edge.ghost || edge.cyclic) continue;
    const pts = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) > 1e-6) continue;
      if (a.x < minLeft || a.x > maxRight) continue;
      if (Math.min(a.y, b.y) > bottom || Math.max(a.y, b.y) < top) continue;
      taken.add(Math.round(a.x / TRUNK_LANE_GAP));
    }
  }
  return Math.max(0, lanes - taken.size);
}
