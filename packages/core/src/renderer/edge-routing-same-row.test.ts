/**
 * The same-row route (#3026): an edge between two cards of one row goes round
 * the card between them through the channel above or below the row.
 *
 * These drive `routeGroupedEdges` directly on hand-placed cards, so the way
 * the row is measured is pinned on its own. The whole-chain behaviour (no
 * penetration, no collinear overlap, lanes clear of the row) is fenced on
 * laid-out models in `routing-parity.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { routeGroupedEdges } from "./edge-routing-groups.js";
import { ObstacleIndex } from "./obstacle-index.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

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

/** A leftward same-row edge, anchored mid-height on the facing sides as the pipeline does. */
function leftward(from: LayoutNode, to: LayoutNode): LayoutEdge {
  return {
    from: from.id,
    to: to.id,
    fromPoint: { x: from.x, y: from.y + from.height / 2 },
    toPoint: { x: to.x + to.width, y: to.y + to.height / 2 },
  } as LayoutEdge;
}

function route(cards: LayoutNode[], edge: LayoutEdge): LayoutEdge {
  const nodes = new Map(cards.map((c) => [c.id, c]));
  routeGroupedEdges(nodes, [edge], [], ObstacleIndex.build(cards, []), undefined, false);
  return edge;
}

/** Which side of the band `top`..`bottom` every bend of the route lies on. */
function sideOf(edge: LayoutEdge, top: number, bottom: number): "above" | "below" | "other" {
  const ys = (edge.waypoints ?? []).map((p) => p.y);
  if (ys.length > 0 && ys.every((y) => y < top)) return "above";
  if (ys.length > 0 && ys.every((y) => y > bottom)) return "below";
  return "other";
}

describe("same-row route measures the row it goes round (#3026)", () => {
  it("leaves a side-column card out of the row, so the channel below stays above the next row", () => {
    // A ← C with B between, a second row (D, E) below, and a side-column card
    // X that spans both rows. X is not in the way of the route, but if it were
    // taken into the row, the row would reach down to X's bottom, the channel
    // below would land under the second row, and the stub into A would cross
    // D. The leftward edge prefers the channel below (clockwise).
    const [a, b, c] = [card("A", 0, 0), card("B", 150, 0), card("C", 300, 0)];
    const cards = [a, b, c, card("D", 0, 140), card("E", 300, 140), card("X", 500, 30, 100, 150)];
    const edge = route(cards, leftward(c, a));
    expect(sideOf(edge, 0, 60)).toBe("below");
    expect(Math.max(...edge.waypoints!.map((p) => p.y))).toBeLessThan(140);
  });

  it("takes in every card between the pair, whatever order the cards are visited in", () => {
    // M1 stands between the pair and reaches below it; M2 overlaps only the
    // part of the row M1 added. Visited before M1, M2 used to be skipped, the
    // channel below was measured from M1's bottom, and the run along it
    // crossed M2. Measured from the whole row, the route clears both.
    const [a, c] = [card("A", 0, 0), card("C", 400, 0)];
    const m2 = card("M2", 270, 80);
    const m1 = card("M1", 150, 0, 100, 100);
    const edge = route([a, c, m2, m1], leftward(c, a));
    expect(sideOf(edge, 0, 140)).toBe("below");
  });
});

describe("same-row route when the seats beside each card's centre are taken (#3309)", () => {
  /** The five stub seats `channelStub` tries first: the centre and two lane pitches either side. */
  const nearSeats = (c: LayoutNode) => [-48, -24, 0, 24, 48].map((dx) => c.x + c.width / 2 + dx);

  /**
   * A route already on the canvas whose middle verticals stand on `xs` between
   * `y0` and `y1`. Middle segments belong to no card, so a stub from any card
   * conflicts with them, as the corridors dropping through a busy channel do.
   */
  function occupying(id: string, xs: number[], y0: number, y1: number): LayoutEdge {
    const waypoints = xs.flatMap((x, i) =>
      i % 2 === 0
        ? [
            { x, y: y0 },
            { x, y: y1 },
          ]
        : [
            { x, y: y1 },
            { x, y: y0 },
          ],
    );
    return {
      from: "P",
      to: "Q",
      fromPoint: { x: -600, y: y0 },
      waypoints,
      toPoint: { x: -600, y: waypoints[waypoints.length - 1].y },
      id,
    } as unknown as LayoutEdge;
  }

  function routeAmong(cards: LayoutNode[], edges: LayoutEdge[]): void {
    const nodes = new Map(cards.map((c) => [c.id, c]));
    routeGroupedEdges(nodes, edges, [], ObstacleIndex.build(cards, []), undefined, false);
  }

  // Wide cards, so there is room on each side beyond the near seats. P and Q
  // are far away; they only anchor the occupying routes.
  const a = card("A", 0, 0, 300);
  const b = card("B", 400, 0, 300);
  const c = card("C", 800, 0, 300);
  const far = [card("P", -700, -400), card("Q", -700, 400)];
  const busy = () => [
    occupying("a-above", nearSeats(a), -80, -10),
    occupying("c-above", nearSeats(c), -80, -10),
    occupying("a-below", nearSeats(a), 70, 140),
    occupying("c-below", nearSeats(c), 70, 140),
  ];

  it("goes round the card between, on seats further out, instead of staying a chord through it", () => {
    const edge = leftward(c, a);
    routeAmong([a, b, c, ...far], [...busy(), edge]);
    // The route was found at all: before #3309 every side was refused on its
    // stubs and the edge kept no waypoints, a straight line through B.
    expect(edge.waypoints?.length).toBeGreaterThan(0);
    expect(["above", "below"]).toContain(sideOf(edge, 0, 60));
    const [srcStub, ...rest] = edge.waypoints!;
    const tgtStub = rest[rest.length - 1];
    expect(nearSeats(c)).not.toContain(srcStub.x);
    expect(nearSeats(a)).not.toContain(tgtStub.x);
    // Still on its own cards, so the ports stay attachable.
    expect(srcStub.x).toBeGreaterThan(c.x);
    expect(srcStub.x).toBeLessThan(c.x + c.width);
    expect(tgtStub.x).toBeGreaterThan(a.x);
    expect(tgtStub.x).toBeLessThan(a.x + a.width);
  });

  it("takes the first free near seat, in the order it always has, when one is free", () => {
    // Only the centre of each card is taken: the first free near seat, one
    // lane pitch to the left, is the one `channelStub` has always picked.
    // This pins the seat order, not the range: whole-side starts with the same
    // five seats, so both modes agree here. That other candidates keep the
    // near range was measured on the reverse-generated models (#3309).
    const edge = leftward(c, a);
    const centres = (cardBox: LayoutNode) => [cardBox.x + cardBox.width / 2];
    routeAmong(
      [a, b, c, ...far],
      [
        occupying("a-above", centres(a), -80, -10),
        occupying("c-above", centres(c), -80, -10),
        occupying("a-below", centres(a), 70, 140),
        occupying("c-below", centres(c), 70, 140),
        edge,
      ],
    );
    expect(["above", "below"]).toContain(sideOf(edge, 0, 60));
    expect(edge.waypoints![0].x).toBe(c.x + c.width / 2 - 24);
    expect(edge.waypoints![edge.waypoints!.length - 1].x).toBe(a.x + a.width / 2 - 24);
  });
});
