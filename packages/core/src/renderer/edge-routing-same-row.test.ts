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
