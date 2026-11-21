/**
 * The ghost band (#2823): cross-domain ghost entities (entity view) and
 * cross-service ghost domains (service view), placed around the focus frame.
 *
 * - **Side**: a ghost whose relations with this canvas are mostly incoming (it
 *   references the focus) goes above the focus frame; mostly outgoing, or a tie,
 *   goes below. Relations read "holder → referenced", and the layered placement
 *   puts the holder on top, so a one-way ghost's lines flow top to bottom.
 * - **Frames**: ghosts are grouped per (owning group × side). A group of two or
 *   more becomes one muted frame titled with the group label, and its cards drop
 *   the sub-label the title now says. A lone ghost stays a sub-labelled card —
 *   the case ADR-460 rejected wrapping ("a frame around a single domain").
 * - **Wrap**: each side wraps into rows at `max(width budget, focus frame
 *   width)`, and a frame takes no more grid columns than that width holds. A
 *   row or a column cut by it is reported, so the width-budget search
 *   (ADR-2593) tries a wider budget.
 * - **Order**: frames, and cards inside a frame, follow the mean centre x of
 *   their local partners; discovery order breaks ties.
 *
 * Edges are not routed here: `pushGhostEdges` still joins the facing sides.
 */
import type { KrsNode } from "../types/ast.js";
import type { LayoutNode, ContainerRect } from "./layout-types.js";
import {
  CONTAINER_PADDING,
  CONTAINER_LABEL_HEIGHT,
  GHOST_MARGIN,
  getLayoutConstants,
} from "./layout-constants.js";
import { gridColumnCount } from "./layer-layout-logics.js";
import { makeLayoutNode, measureNode, type MeasureContext } from "./layout-measure.js";

/** Gap between the focus side (its outermost inner frame) and the first band row. */
export const GHOST_ROW_GAP = 60;

type BandSide = "above" | "below";

interface BandItem {
  node: KrsNode;
  /** Layout key the ghost is stored under, and that its edges' endpoints remap to. */
  key: string;
  /** The owning domain (entity view) or service (service view) — the frame's identity. */
  groupId: string;
  /** Its label: the frame title, or a lone card's sub-label. */
  groupLabel: string;
}

export interface BandInput {
  items: readonly BandItem[];
  /** The ghost relations, endpoints as written; `remap` turns them into layout keys. */
  edges: readonly { from: string; to: string }[];
  remap: (id: string) => string;
  /** The row-width budget this placement run is trying (ADR-2593). */
  widthBudget: number;
  /**
   * Room reserved before a band row (#3881), keyed `"<side>:<row>"`; row 0's
   * is between the focus side and the first row. `layout()`'s second placement
   * passes what the band's lanes measured they lacked; absent on the first.
   */
  bandGaps?: ReadonlyMap<string, number>;
}

/** The side a ghost goes to, from how many of its relations come in and go out. */
function bandSideOf(incoming: number, outgoing: number): BandSide {
  return incoming > outgoing ? "above" : "below";
}

/** One thing a band row holds: a framed group or a lone card. */
interface BandBox {
  width: number;
  height: number;
  /** Discovery position of the group's first ghost — the tie-break. */
  order: number;
  /** Mean centre x of the group's local partners — the sort key. */
  partnerX: number;
  /** Store the cards (and the frame) with this box's top-left at (x, y). */
  place: (x: number, y: number) => void;
}

interface GhostTally {
  incoming: number;
  outgoing: number;
  partnerXs: number[];
}

/**
 * Place the band and grow the outermost frame around it.
 * @returns whether the width budget cut a band row or a frame's columns.
 */
export function placeGhostBand(
  input: BandInput,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
): boolean {
  const { items } = input;
  if (items.length === 0 || containers.length === 0) return false;
  const { NODE_GAP } = getLayoutConstants(ctx.displayMode);
  const focus = containers.find((c) => !c.ghost && c.ghostBand === undefined) ?? containers[0];
  // The band sits outside every frame between the focus and the outermost one;
  // only the outermost grows around it (design: "which ancestor encloses the band").
  const inner = containers.length > 1 ? containers.slice(1) : [focus];
  const innerTop = Math.min(...inner.map((c) => c.y));
  // Ghost users may already hang below the focus frame in their side column.
  const ghostsBottom = Math.max(
    ...[...layoutNodes.values()].filter((n) => n.ghost).map((n) => n.y + n.height),
  );
  const innerBottom = Math.max(...inner.map((c) => c.y + c.height), ghostsBottom);
  const centreX = focus.x + focus.width / 2;

  const tallies = tallyGhosts(input, layoutNodes);
  const meanX = (xs: readonly number[]) =>
    xs.length === 0 ? centreX : xs.reduce((a, b) => a + b, 0) / xs.length;

  // Group per (side, owning group), in discovery order.
  const groups = new Map<string, { side: BandSide; members: BandItem[]; order: number }>();
  items.forEach((item, order) => {
    const t = tallies.get(item.key);
    const side = bandSideOf(t?.incoming ?? 0, t?.outgoing ?? 0);
    const id = `${side}\u0000${item.groupId}`;
    const group = groups.get(id) ?? { side, members: [], order };
    group.members.push(item);
    groups.set(id, group);
  });

  // The band's rows, and the frames in them, wrap at this width.
  const limit = Math.max(input.widthBudget, focus.width);
  let widthBound = false;
  const boxes: Record<BandSide, BandBox[]> = { above: [], below: [] };
  for (const { side, members, order } of groups.values()) {
    const partnerX = meanX(members.flatMap((m) => tallies.get(m.key)?.partnerXs ?? []));
    const cards = members
      .map((m, i) => ({
        m,
        i,
        dims: measureNode(m.node, undefined, ctx),
        x: meanX(tallies.get(m.key)?.partnerXs ?? []),
      }))
      .sort((a, b) => a.x - b.x || a.i - b.i);
    const store = (c: (typeof cards)[number], x: number, y: number, subLabel?: string) =>
      layoutNodes.set(
        c.m.key,
        makeLayoutNode(c.m.node, c.m.key, {
          label: c.m.node.label ?? c.m.node.id,
          annotations: ctx.effectiveAnnotations(c.m.node),
          ...(subLabel !== undefined ? { subLabel } : {}),
          x,
          y,
          width: c.dims.width,
          height: c.dims.height,
          ghost: true,
          ghostBand: side,
        }),
      );

    if (cards.length === 1) {
      const [card] = cards;
      boxes[side].push({
        width: card.dims.width,
        height: card.dims.height,
        order,
        partnerX,
        place: (x, y) => store(card, x, y, card.m.groupLabel),
      });
      continue;
    }

    const columnWidth = Math.max(...cards.map((c) => c.dims.width));
    // A frame takes no more columns than fit the band's width; a column the
    // limit cut is reported, so the search can try a wider budget.
    const preferred = Math.min(gridColumnCount(cards.length), cards.length);
    const fitting = Math.floor(
      (limit - CONTAINER_PADDING * 2 + NODE_GAP) / (columnWidth + NODE_GAP),
    );
    const columns = Math.max(1, Math.min(preferred, fitting));
    if (columns < preferred) widthBound = true;
    const rows: (typeof cards)[] = [];
    for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
    const rowHeights = rows.map((row) => Math.max(...row.map((c) => c.dims.height)));
    const rowGap = NODE_GAP / 2;
    const contentHeight = rowHeights.reduce((a, b) => a + b, 0) + (rows.length - 1) * rowGap;
    const width = columns * columnWidth + (columns - 1) * NODE_GAP + CONTAINER_PADDING * 2;
    const height = CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING + contentHeight;
    const { groupId, groupLabel } = members[0];
    boxes[side].push({
      width,
      height,
      order,
      partnerX,
      place: (x, y) => {
        containers.push({
          // Side and group both: one group can frame ghosts above and below.
          id: `ghost-band:${side}:${groupId}`,
          label: groupLabel,
          x,
          y,
          width,
          height,
          ghost: false,
          ghostBand: side,
        });
        let rowY = y + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING / 2;
        rows.forEach((row, r) => {
          row.forEach((c, col) => {
            const cellX = x + CONTAINER_PADDING + col * (columnWidth + NODE_GAP);
            store(c, cellX + (columnWidth - c.dims.width) / 2, rowY);
          });
          rowY += rowHeights[r] + rowGap;
        });
      },
    });
  }

  const placed: { x: number; y: number; width: number; height: number }[] = [];
  for (const side of ["above", "below"] as const) {
    const sorted = boxes[side].sort((a, b) => a.partnerX - b.partnerX || a.order - b.order);
    const rows = wrapRows(sorted, limit, NODE_GAP);
    if (rows.length > 1) widthBound = true;
    // Row 0 faces the focus; the upper band stacks upward, bottom-aligned.
    const extra = (row: number) => input.bandGaps?.get(`${side}:${row}`) ?? 0;
    const step = side === "below" ? 1 : -1;
    let edgeY = (side === "below" ? innerBottom : innerTop) + step * (GHOST_ROW_GAP + extra(0));
    for (const [r, row] of rows.entries()) {
      if (r > 0) edgeY += step * extra(r);
      const rowWidth = row.reduce((a, b) => a + b.width, 0) + (row.length - 1) * NODE_GAP;
      const rowHeight = Math.max(...row.map((b) => b.height));
      let x = centreX - rowWidth / 2;
      for (const box of row) {
        const y = side === "below" ? edgeY : edgeY - box.height;
        box.place(x, y);
        placed.push({ x, y, width: box.width, height: box.height });
        x += box.width + NODE_GAP;
      }
      edgeY += side === "below" ? rowHeight + NODE_GAP : -(rowHeight + NODE_GAP);
    }
  }

  if (containers[0] !== focus) growAround(containers[0], placed);
  return widthBound;
}

/** Count each ghost's incoming / outgoing relations and collect its partners' centre x. */
function tallyGhosts(
  { items, edges, remap }: BandInput,
  layoutNodes: ReadonlyMap<string, LayoutNode>,
): Map<string, GhostTally> {
  const keys = new Set(items.map((i) => i.key));
  const tallies = new Map<string, GhostTally>();
  for (const edge of edges) {
    const from = remap(edge.from);
    const to = remap(edge.to);
    const ghost = keys.has(from) ? from : keys.has(to) ? to : undefined;
    if (ghost === undefined) continue;
    const tally = tallies.get(ghost) ?? { incoming: 0, outgoing: 0, partnerXs: [] };
    // The ghost holds the reference (it is `from`): the relation comes into this canvas.
    if (ghost === from) tally.incoming++;
    else tally.outgoing++;
    const partner = layoutNodes.get(ghost === from ? to : from);
    if (partner) tally.partnerXs.push(partner.x + partner.width / 2);
    tallies.set(ghost, tally);
  }
  return tallies;
}

/** Greedy left-to-right rows of at most `limit` width; a box wider than the limit gets its own row. */
function wrapRows(boxes: readonly BandBox[], limit: number, gap: number): BandBox[][] {
  const rows: BandBox[][] = [];
  let width = 0;
  for (const box of boxes) {
    const row = rows.at(-1);
    if (row && width + gap + box.width <= limit) {
      row.push(box);
      width += gap + box.width;
    } else {
      rows.push([box]);
      width = box.width;
    }
  }
  return rows;
}

/** Grow `outer` to hold `rects` with `GHOST_MARGIN` around them and room for its title above. */
function growAround(
  outer: ContainerRect,
  rects: readonly { x: number; y: number; width: number; height: number }[],
): void {
  if (rects.length === 0) return;
  const minX = Math.min(...rects.map((r) => r.x)) - GHOST_MARGIN;
  const maxX = Math.max(...rects.map((r) => r.x + r.width)) + GHOST_MARGIN;
  const minY = Math.min(...rects.map((r) => r.y)) - GHOST_MARGIN - CONTAINER_LABEL_HEIGHT;
  const maxY = Math.max(...rects.map((r) => r.y + r.height)) + GHOST_MARGIN;
  const right = Math.max(outer.x + outer.width, maxX);
  const bottom = Math.max(outer.y + outer.height, maxY);
  outer.x = Math.min(outer.x, minX);
  outer.y = Math.min(outer.y, minY);
  outer.width = right - outer.x;
  outer.height = bottom - outer.y;
}
