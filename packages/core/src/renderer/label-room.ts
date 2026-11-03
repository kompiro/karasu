/**
 * Label room (#3036): after the width-budget search, open room for the labels
 * the renderer's pass could not seat on the first placement, and keep it only
 * where it seats strictly more of them.
 *
 * Two candidates are placed on top of the structural reservations (ADR-2598 /
 * ADR-2611 / #3154): A opens the channels between rows by the withheld labels'
 * heights, B also opens the gaps inside rows by their widths. A gap inside a
 * row is a corridor routing can take (ADR-2611), so widening it can draw edges
 * in from the gutter and withhold more labels elsewhere; a channel's height
 * opens no new corridor. Placing both and counting is what keeps B where it
 * helps and drops it where it does not (TPL-3036). Every candidate is decided
 * from the first placement alone, so there is no loop to converge (TPL-2593).
 */
import { channelLimitsOf } from "./edge-routing-lanes.js";
import { channelLanes } from "./layout-reservations.js";
import { applyMutualPairs } from "./mutual-pair.js";
import type {
  ContainerRect,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
  WithheldLabel,
} from "./layout-types.js";

/** Room kept above and below a label stacked in a channel. */
const CHANNEL_LABEL_MARGIN = 2;
/** Room kept either side of a label across a gap inside a row. */
const ROW_LABEL_MARGIN = 8;

type Rows = readonly (readonly string[])[];
type ColumnRoom = ReadonlyMap<number, ReadonlyMap<string, number>>;

interface Run {
  result: LayoutResult;
  rows: Rows;
  enclosure?: ContainerRect;
  crossingMarksPending: boolean;
}

/** Top and bottom of each row's drawn cards; `Infinity` / `-Infinity` for a row with none. */
function rowBounds(result: LayoutResult, rows: Rows): { top: number; bottom: number }[] {
  return rows.map((row) => {
    let top = Infinity;
    let bottom = -Infinity;
    for (const id of row) {
      const n = result.nodes.get(id);
      if (!n || n.ghost) continue;
      top = Math.min(top, n.y);
      bottom = Math.max(bottom, n.y + n.height);
    }
    return { top, bottom };
  });
}

/**
 * Height the withheld labels anchored in each channel ask for, keyed by the
 * row ordinal the channel runs above (`rows.length` below the last row). The
 * channel spans the frame's ceiling to the first row, one row's bottom to the
 * next row's top, and the last row to the frame's floor (#3132). Labels side
 * by side share the height and labels over the same x stack, so the demand is
 * the largest sum of heights over any x.
 */
export function labelRoomInChannels(
  result: LayoutResult,
  rows: Rows,
  enclosure: ContainerRect | undefined,
  withheld: readonly WithheldLabel[],
): Map<number, { height: number; gap: number }> {
  const out = new Map<number, { height: number; gap: number }>();
  if (rows.length === 0 || withheld.length === 0) return out;
  const bounds = rowBounds(result, rows);
  const limits = channelLimitsOf(enclosure);
  for (let r = 0; r <= rows.length; r++) {
    const upper = r === 0 ? limits.ceiling : bounds[r - 1].bottom;
    const lower = r === rows.length ? limits.floor : bounds[r].top;
    if (!Number.isFinite(upper) || !Number.isFinite(lower)) continue;
    const events: [x: number, height: number][] = [];
    for (const label of withheld) {
      if (label.anchor.y <= upper || label.anchor.y >= lower) continue;
      const height = label.height + 2 * CHANNEL_LABEL_MARGIN;
      events.push([label.anchor.x - label.width / 2, height]);
      events.push([label.anchor.x + label.width / 2, -height]);
    }
    if (events.length === 0) continue;
    // Ends before starts at the same x: labels that only touch do not stack.
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let sum = 0;
    let height = 0;
    for (const [, h] of events) {
      sum += h;
      height = Math.max(height, sum);
    }
    out.set(r, { height, gap: lower - upper });
  }
  return out;
}

/**
 * Width each gap between two neighbouring cards of a row is short of for the
 * widest withheld label anchored in it, keyed like `columnReservations` (row
 * ordinal → the card the width is opened before, TPL-2611). The row's outer
 * edges are not opened: what lies beyond them is the gutter (ADR-2611).
 */
export function labelRoomInRows(
  result: LayoutResult,
  rows: Rows,
  withheld: readonly WithheldLabel[],
): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  rows.forEach((row, r) => {
    const cards = row
      .map((id) => result.nodes.get(id))
      .filter((n): n is LayoutNode => !!n && !n.ghost)
      .sort((a, b) => a.x - b.x);
    if (cards.length < 2) return;
    const top = Math.min(...cards.map((n) => n.y));
    const bottom = Math.max(...cards.map((n) => n.y + n.height));
    for (let i = 0; i + 1 < cards.length; i++) {
      const left = cards[i].x + cards[i].width;
      const right = cards[i + 1].x;
      let demand = 0;
      for (const { anchor, width } of withheld) {
        if (anchor.x <= left || anchor.x >= right || anchor.y < top || anchor.y > bottom) continue;
        demand = Math.max(demand, width + 2 * ROW_LABEL_MARGIN);
      }
      const extra = Math.ceil(demand - (right - left));
      if (extra <= 0) continue;
      const slot = out.get(r) ?? new Map<string, number>();
      slot.set(cards[i + 1].id, extra);
      out.set(r, slot);
    }
  });
  return out;
}

/**
 * Splits the run's mutual pairs (#3027) so the label pass sees the halves the
 * renderer draws, and marks the run settled: the placement `layout()` returns
 * keeps this split instead of splitting again.
 */
function settle(run: Run, options: LayoutOptions): void {
  if (!run.crossingMarksPending) return;
  run.result.crossingMarks = applyMutualPairs(run.result.edges, options);
  run.crossingMarksPending = false;
}

/**
 * Picks the placement `layout()` returns. The baseline is the first placement,
 * or the structural second one when there is one. A label-room candidate
 * replaces it only when it withholds strictly fewer labels, and a tie keeps
 * the candidate with less room (A before B), so a view whose labels all fit,
 * or whose room seats none of them, comes out exactly as before.
 */
export function chooseLabelRoom<R extends Run>(input: {
  first: R;
  structural: R | undefined;
  reservations: ReadonlyMap<number, number>;
  columns: ColumnRoom;
  options: LayoutOptions;
  place: (rows: ReadonlyMap<number, number>, columns: ColumnRoom) => R;
}): { run: R; passes: 1 | 2 | 3 | 4; labelRoom?: LayoutResult["labelRoom"] } {
  const { first, structural, reservations, columns, options, place } = input;
  const baseline = { run: structural ?? first, passes: structural ? 2 : 1 } as const;
  const withheldOf = options.withheldLabels;
  // The multi-system root has no canvas-wide rows to open (ADR-2598).
  if (!withheldOf || first.rows.length === 0) return baseline;
  // Lanes are counted on the edges before the mutual pairs are split, as the
  // structural reservations were; the labels on the halves the canvas draws.
  const lanes = channelLanes(first.result, first.rows, first.enclosure);
  settle(first, options);
  const withheld = withheldOf(first.result);
  if (withheld.length === 0) return baseline;

  const channelRows = new Map(reservations);
  let channelRoom = false;
  for (const [r, room] of labelRoomInChannels(
    first.result,
    first.rows,
    first.enclosure,
    withheld,
  )) {
    const lane = lanes.get(r);
    const extra = Math.ceil((lane?.need ?? 0) + room.height - (lane?.gap ?? room.gap));
    if (extra > (channelRows.get(r) ?? 0)) {
      channelRows.set(r, extra);
      channelRoom = true;
    }
  }
  const rowColumns = new Map([...columns].map(([r, m]) => [r, new Map(m)] as const));
  let rowRoom = false;
  for (const [r, slot] of labelRoomInRows(first.result, first.rows, withheld)) {
    const into = rowColumns.get(r) ?? new Map<string, number>();
    for (const [id, width] of slot) {
      if (width > (into.get(id) ?? 0)) {
        into.set(id, width);
        rowRoom = true;
      }
    }
    rowColumns.set(r, into);
  }
  const candidates: { room: NonNullable<LayoutResult["labelRoom"]>; make: () => R }[] = [];
  if (channelRoom) candidates.push({ room: "channels", make: () => place(channelRows, columns) });
  if (rowRoom)
    candidates.push({ room: "channels+rows", make: () => place(channelRows, rowColumns) });
  if (candidates.length === 0) return baseline;

  const count = (run: R): number => {
    settle(run, options);
    return withheldOf(run.result).length;
  };
  let best: { run: R; labelRoom?: LayoutResult["labelRoom"] } = { run: baseline.run };
  let fewest = structural ? count(structural) : withheld.length;
  for (const { room, make } of candidates) {
    const run = make();
    const withheldHere = count(run);
    if (withheldHere < fewest) {
      fewest = withheldHere;
      best = { run, labelRoom: room };
    }
  }
  const passes = (baseline.passes + candidates.length) as 2 | 3 | 4;
  return { ...best, passes };
}
