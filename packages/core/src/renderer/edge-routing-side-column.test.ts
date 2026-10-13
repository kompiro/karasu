/**
 * The last-resort corridor (#3133): an edge between the grid and the far end
 * of a side column (ADR-1728) runs down the free column between the two when
 * no other candidate clears.
 *
 * These drive `routeGroupedEdges` directly on hand-placed cards, so the
 * geometry that defeats every other candidate is pinned on its own: rows
 * staggered so no column inside the grid runs clear, a side column stacked
 * past the grid's bottom so every stub out to a gutter crosses it, and a card
 * at the target's height across the middle so the near gutter's stub is
 * blocked too. The whole-chain behaviour is fenced on laid-out models in
 * `routing-parity.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { routeGroupedEdges } from "./edge-routing-groups.js";
import { ObstacleIndex } from "./obstacle-index.js";
import { countPolylinePenetrations, type Point } from "./edge-geometry.js";
import type { ContainerRect, LayoutEdge, LayoutNode } from "./layout-types.js";

function card(id: string, x: number, y: number, width = 100, height = 60): LayoutNode {
  return {
    kind: "service",
    id,
    label: id,
    properties: {},
    linkCount: 0,
    hasChildren: false,
    hasDescription: false,
    x,
    y,
    width,
    height,
  } as LayoutNode;
}

const GRID_COLUMNS = 4;
const COLUMN_PITCH = 150;
const SIDE_GAP = 100;
const STACK_PITCH = 84;

/**
 * Five rows of four cards, every other row shifted half a pitch, then a side
 * column `SIDE_GAP` to the right starting at `columnTop`, with `Gateway` the
 * ninth card down, and `Low` standing across the middle at Gateway's height.
 * `rowTops` and `heights` let a case move the rows and stretch one card.
 */
function canvas(
  columnTop: number,
  rowTops = [0, 120, 240, 360, 480],
  heights: Record<string, number> = {},
): {
  cards: LayoutNode[];
  gateway: LayoutNode;
  gap: { left: number; right: number };
} {
  const cards: LayoutNode[] = [];
  rowTops.forEach((y, r) => {
    const shift = r % 2 === 0 ? 0 : COLUMN_PITCH / 2;
    for (let c = 0; c < GRID_COLUMNS; c++) {
      const id = `G${r}${c}`;
      cards.push(card(id, shift + c * COLUMN_PITCH, y, 100, heights[id] ?? 60));
    }
  });
  const gridRight = Math.max(...cards.map((c) => c.x + c.width));
  const sideX = gridRight + SIDE_GAP;
  for (let i = 0; i < 8; i++) cards.push(card(`X${i}`, sideX, columnTop + i * STACK_PITCH));
  const gateway = card("Gateway", sideX, columnTop + 8 * STACK_PITCH);
  cards.push(gateway, card("Low", COLUMN_PITCH, gateway.y - 20, 300, 60));
  return { cards, gateway, gap: { left: gridRight, right: sideX } };
}

/** The top-left card to `to`, anchored mid-height on the facing sides as the pipeline does. */
function fromCorner(cards: LayoutNode[], to: LayoutNode): LayoutEdge {
  const from = cards.find((c) => c.id === "G00")!;
  return {
    from: from.id,
    to: to.id,
    fromPoint: { x: from.x + from.width, y: from.y + from.height / 2 },
    toPoint: { x: to.x, y: to.y + to.height / 2 },
  } as LayoutEdge;
}

function route(cards: LayoutNode[], edge: LayoutEdge): Point[] {
  const nodes = new Map(cards.map((c) => [c.id, c]));
  routeGroupedEdges(nodes, [edge], [], ObstacleIndex.build(cards, []), undefined, false);
  return [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
}

function penetrations(cards: LayoutNode[], edge: LayoutEdge, path: Point[]): number {
  return countPolylinePenetrations(
    path,
    cards.filter((c) => c.id !== edge.from && c.id !== edge.to),
  );
}

/** The x of the route's verticals. */
function verticalXs(path: Point[]): number[] {
  return path.slice(1).flatMap((p, i) => (Math.abs(p.x - path[i].x) < 1e-6 ? [p.x] : []));
}

describe("last-resort corridor beside a side column (#3133)", () => {
  it("runs an edge to the far end of the column down the gap between it and the grid", () => {
    // The first column card straddles the corner card's bottom, so the run
    // along the channel below it would cross that card on its way out to the
    // right gutter. Nothing else clears, and the gap is far from the
    // endpoints' midpoint, outside the nearest few corridors tried first.
    const { cards, gateway, gap } = canvas(30);
    const edge = fromCorner(cards, gateway);
    const straight = [edge.fromPoint, edge.toPoint];
    expect(penetrations(cards, edge, straight)).toBeGreaterThan(0);

    const path = route(cards, edge);
    expect(penetrations(cards, edge, path)).toBe(0);
    expect(verticalXs(path).some((x) => x > gap.left && x < gap.right)).toBe(true);
  });

  it("measures the channel from the cards under the run, not from the side column", () => {
    // The corner card's neighbour is taller, reaching past the midpoint
    // between its row and the next, and a column card starts just below the
    // corner card. Measured from every card, the channel falls between that
    // column card and the corner card's bottom; measured from the corner card
    // alone, at the midpoint. Both are inside the neighbour, so the stub's run
    // crosses it. Measured from the whole row under the run, it falls between
    // the neighbour's bottom and the next row.
    const { cards, gateway, gap } = canvas(-18, [0, 140, 260, 380, 500], {
      G01: 120,
    });
    const edge = fromCorner(cards, gateway);

    const path = route(cards, edge);
    expect(penetrations(cards, edge, path)).toBe(0);
    const neighbour = cards.find((c) => c.id === "G01")!;
    const runs = path.slice(1).flatMap((p, i) => (Math.abs(p.y - path[i].y) < 1e-6 ? [p.y] : []));
    expect(runs[0]).toBeGreaterThan(neighbour.y + neighbour.height);
    expect(verticalXs(path).some((x) => x > gap.left && x < gap.right)).toBe(true);
  });

  it("is not offered on a grouped canvas", () => {
    // The free columns are measured from cards alone, so on a grouped canvas
    // one can run through a frame's header (the reason ADR-3026 kept its
    // channel route ungrouped). With a frame on the canvas, the gap beside the
    // column is not taken.
    const { cards, gateway, gap } = canvas(30);
    const edge = fromCorner(cards, gateway);
    const nodes = new Map(cards.map((c) => [c.id, c]));
    const frame: ContainerRect = {
      id: "F",
      label: "F",
      x: -20,
      y: -40,
      width: 680,
      height: 900,
      ghost: false,
    };
    routeGroupedEdges(
      nodes,
      [edge],
      [frame],
      ObstacleIndex.build(cards, [frame]),
      undefined,
      false,
    );
    const path = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    expect(verticalXs(path).filter((x) => x > gap.left && x < gap.right)).toEqual([]);
  });
});
