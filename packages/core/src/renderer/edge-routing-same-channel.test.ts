/**
 * A pair of cards in adjacent rows whose routes both drop into the one channel
 * between the rows (#3134, TPL-3134).
 *
 * When both side stubs of an edge are blocked, the corridor and mixed routes
 * enter each end through a top/bottom port and the channel beside it. For two
 * cards in adjacent rows that is the *same* channel, so the vertical joining
 * the two ends has no length. Before #3134 the route kept it: the claim check
 * skipped it, the pair drawn the other way took the same x, and the lane pass
 * then gave each half of each run its own lane, so both verticals came out on
 * one line. Now the route crosses the channel as one run.
 *
 * These drive `runRoutingChain` on hand-placed cards, because the overlap only
 * appears once the lane pass has run, and because placement keeps a two-way
 * pair next to each other: no laid-out model in `routing-parity.test.ts`
 * reaches this (TPL-2598). The cards are one layer wrapped into rows, as a
 * drill-down's are, so the endpoints face each other side to side.
 */
import { describe, it, expect } from "vitest";
import { runRoutingChain } from "./layout-edges.js";
import { countPolylinePenetrations, type Point } from "./edge-geometry.js";
import type { ContainerRect, LayoutEdge, LayoutNode } from "./layout-types.js";

function card(id: string, x: number, y: number, width = 160, height = 66): LayoutNode {
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

/** An edge between two cards of one layer: anchored mid-height on the facing sides. */
function sideToSide(from: LayoutNode, to: LayoutNode): LayoutEdge {
  const right = to.x > from.x;
  return {
    from: from.id,
    to: to.id,
    fromPoint: { x: right ? from.x + from.width : from.x, y: from.y + from.height / 2 },
    toPoint: { x: right ? to.x : to.x + to.width, y: to.y + to.height / 2 },
  } as LayoutEdge;
}

function pointsOf(e: LayoutEdge): Point[] {
  return [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
}

/** Vertical segments of two different edges that lie on one x and overlap in y. */
function sharedVerticals(edges: LayoutEdge[]): number {
  const segs = edges.flatMap((e, i) => {
    const pts = pointsOf(e);
    return pts.slice(0, -1).flatMap((a, k) => {
      const b = pts[k + 1];
      if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) <= 1e-6) return [];
      return [{ edge: i, x: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) }];
    });
  });
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = [segs[i], segs[j]];
      if (a.edge === b.edge || Math.abs(a.x - b.x) > 1e-6) continue;
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 1e-6) n++;
    }
  }
  return n;
}

/** Route a two-way pair through the whole chain, lane pass included. */
function routePair(
  cards: LayoutNode[],
  from: string,
  to: string,
  frames: ContainerRect[] = [],
): LayoutEdge[] {
  const nodes = new Map(cards.map((c) => [c.id, c]));
  const edges = [
    sideToSide(nodes.get(from)!, nodes.get(to)!),
    sideToSide(nodes.get(to)!, nodes.get(from)!),
  ];
  runRoutingChain(nodes, edges, frames, {
    expandedFrames: undefined,
    groupBands: null,
    ports: undefined,
  });
  return edges;
}

/** The channel between rows `upper` and `lower`, as a y range. */
function channel(upper: LayoutNode, lower: LayoutNode): { top: number; bottom: number } {
  return { top: upper.y + upper.height, bottom: lower.y };
}

describe("a two-way pair in adjacent rows crosses their channel as one run (#3134)", () => {
  describe("through an interior corridor", () => {
    // C (top right) and D (bottom left). B is wider than E, so the corridor
    // beside E runs through B's column: C's side stub towards it crosses B,
    // D's crosses E, and both ends drop into the channel between the rows.
    // On main both edges took the corridor beside E and overlapped on it.
    const cards = [
      card("A", 0, 0),
      card("B", 220, 0, 180),
      card("C", 460, 0),
      card("D", 0, 166),
      card("E", 220, 166, 140),
      card("F", 460, 166),
    ];
    const laid = () => routePair(cards, "C", "D");

    it("routes both edges, and each has a single run in the channel", () => {
      const { top, bottom } = channel(cards[2], cards[3]);
      for (const e of laid()) {
        const wps = e.waypoints ?? [];
        expect(wps).toHaveLength(2);
        expect(wps[0].y).toBe(wps[1].y);
        expect(wps[0].y).toBeGreaterThan(top);
        expect(wps[0].y).toBeLessThan(bottom);
      }
    });

    it("the two edges share no vertical, and neither crosses a card", () => {
      const edges = laid();
      expect(sharedVerticals(edges)).toBe(0);
      for (const e of edges) {
        const others = cards.filter((c) => c.id !== e.from && c.id !== e.to);
        expect(countPolylinePenetrations(pointsOf(e), others)).toBe(0);
      }
    });
  });

  describe("through a mixed gutter route", () => {
    // One frame round both rows, so the interior candidates are off and the
    // gutters are what is left. C and E sit in inner columns: a side stub
    // towards either gutter crosses a neighbour, so both ends drop into the
    // channel. On main both edges ran out to the left gutter and back, and
    // overlapped on it.
    const cards = [..."ACBGH"]
      .map((id, i) => card(id, i * 220, 0))
      .concat([..."DIJEF"].map((id, i) => card(id, i * 220, 166)));
    const frame = {
      id: "team:x",
      label: "X",
      x: -20,
      y: -40,
      width: 1100,
      height: 312,
      ghost: false,
      group: true,
    } as ContainerRect;
    const laid = () => routePair(cards, "C", "E", [frame]);
    const byId = (id: string) => cards.find((c) => c.id === id)!;

    it("routes both edges, and each has a single run in the channel, inside the content", () => {
      const { top, bottom } = channel(byId("C"), byId("E"));
      const left = Math.min(...cards.map((c) => c.x));
      const right = Math.max(...cards.map((c) => c.x + c.width));
      for (const e of laid()) {
        const wps = e.waypoints ?? [];
        expect(wps).toHaveLength(2);
        expect(wps[0].y).toBe(wps[1].y);
        expect(wps[0].y).toBeGreaterThan(top);
        expect(wps[0].y).toBeLessThan(bottom);
        for (const p of wps) {
          expect(p.x).toBeGreaterThanOrEqual(left);
          expect(p.x).toBeLessThanOrEqual(right);
        }
      }
    });

    it("the two edges share no vertical, and neither crosses a card", () => {
      const edges = laid();
      expect(sharedVerticals(edges)).toBe(0);
      for (const e of edges) {
        const others = cards.filter((c) => c.id !== e.from && c.id !== e.to);
        expect(countPolylinePenetrations(pointsOf(e), others)).toBe(0);
      }
    });
  });
});
