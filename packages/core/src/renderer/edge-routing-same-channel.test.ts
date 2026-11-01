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
 * reaches this (TPL-2598). The endpoints face each other side to side across
 * two rows. `computeEdgePoints` anchored one layer wrapped into rows that way
 * until #3494; here it is a hand-built input for the router.
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

/** An edge anchored mid-height on the two cards' facing sides. */
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
    enclosure: undefined,
  });
  return edges;
}

/** A hand-placed layout: the cards, the two ends of the pair, and any group frames. */
interface Case {
  cards: LayoutNode[];
  pair: [string, string];
  frames?: ContainerRect[];
}

/**
 * Two rows with the pair in the corner columns: C (top right) and D (bottom
 * left). B is wider than E, so the corridor beside E runs through B's column:
 * C's side stub towards it crosses B, D's crosses E, and both ends drop into
 * the channel between the rows. On main both edges took that corridor and
 * overlapped on it, as the Umami pairs did.
 */
const throughColumn: Case = {
  cards: [
    card("A", 0, 0),
    card("B", 220, 0, 180),
    card("C", 460, 0),
    card("D", 0, 166),
    card("E", 220, 166, 140),
    card("F", 460, 166),
  ],
  pair: ["C", "D"],
};

/**
 * The same pair with the corridor in a gap: B stands right of E, so the
 * corridor between them blocks C's side stub on B and D's on E. With `height`
 * below the row's, C is shorter than its row-mates, and its channel stub stops
 * higher in the channel than D's does: the two ends no longer agree on a y,
 * though they are in one channel. On main that left a short corridor between
 * them, and the run still folded.
 */
function throughGap(height: number): Case {
  return {
    cards: [
      card("A", 0, 0),
      card("B", 400, 0),
      card("C", 620, 0, 160, height),
      card("D", 0, 166),
      card("E", 200, 166, 140),
      card("F", 620, 166),
    ],
    pair: ["C", "D"],
  };
}

/**
 * One frame round two rows of five, so the interior candidates are off and the
 * gutters are what is left. C and E sit in inner columns: a side stub towards
 * either gutter crosses a neighbour, so both ends drop into the channel. On
 * main both edges ran out to the left gutter and back, and overlapped on it.
 * With `height` below the row's, C is shorter than its row-mates, as above.
 */
function mixed(height: number): Case {
  return {
    cards: [..."ACBGH"]
      .map((id, i) => card(id, i * 220, 0, 160, id === "C" ? height : 66))
      .concat([..."DIJEF"].map((id, i) => card(id, i * 220, 166))),
    pair: ["C", "E"],
    frames: [
      {
        id: "team:x",
        label: "X",
        x: -20,
        y: -40,
        width: 1100,
        height: 312,
        ghost: false,
        group: true,
      } as ContainerRect,
    ],
  };
}

const CASES: [string, Case][] = [
  ["interior corridor through a column", throughColumn],
  ["interior corridor through a gap", throughGap(66)],
  ["interior corridor through a gap, the upper card shorter than its row", throughGap(50)],
  ["mixed gutter route", mixed(66)],
  ["mixed gutter route, the upper card shorter than its row", mixed(50)],
];

describe("a two-way pair in adjacent rows crosses their channel as one run (#3134)", () => {
  it.each(CASES)(
    "%s: each edge has a single run, inside the channel and the content",
    (_name, { cards, pair, frames }) => {
      const upper = cards.filter((c) => c.y === 0);
      const top = Math.max(...upper.map((c) => c.y + c.height));
      const bottom = Math.min(...cards.filter((c) => c.y > 0).map((c) => c.y));
      const left = Math.min(...cards.map((c) => c.x));
      const right = Math.max(...cards.map((c) => c.x + c.width));
      for (const e of routePair(cards, pair[0], pair[1], frames)) {
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
    },
  );

  it.each(CASES)(
    "%s: the two edges share no vertical, and neither crosses a card",
    (_name, { cards, pair, frames }) => {
      const edges = routePair(cards, pair[0], pair[1], frames);
      expect(sharedVerticals(edges)).toBe(0);
      for (const e of edges) {
        const others = cards.filter((c) => c.id !== e.from && c.id !== e.to);
        expect(countPolylinePenetrations(pointsOf(e), others)).toBe(0);
      }
    },
  );
});
