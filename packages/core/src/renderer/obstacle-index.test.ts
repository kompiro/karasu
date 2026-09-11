/**
 * Parity between the indexed obstacle query (#2790) and the flat scan it
 * replaced.
 *
 * The index is a spatial **prefilter** in front of the same `segmentCrossesRect`
 * clip, so for every scene, every edge exemption and every segment the two must
 * give the same answer. A prefilter that dropped an obstacle the exact test
 * would have rejected the route for shows up here as `indexed=false, flat=true`.
 *
 * The reference implementation lives in this file rather than in production, so
 * that the tests drive the shipped query API and nothing exists in `src` purely
 * to be compared against (the pattern #2760's parity suites established). It is
 * a transcription of the `obstaclesFor` / `segmentCrossesAnyRect` /
 * `polylineClearOf` trio the index made redundant.
 *
 * Note on what "superset" means here. The grid is allowed to offer extra
 * candidates but never to drop one, and the query surface is boolean: the flat
 * scan answers "does any non-exempt obstacle cross?", which is true exactly when
 * the crossing set is non-empty. So `indexed === flat` on every segment *is* the
 * no-obstacle-was-dropped property. "no single obstacle is dropped" below states
 * it one obstacle at a time as well, which is the same claim without the OR.
 */
import { describe, it, expect } from "vitest";
import { ObstacleIndex } from "./obstacle-index.js";
import { buildFramesOfNode, framePieces } from "./frame-geometry.js";
import { segmentCrossesRect, type Point, type Rect } from "./edge-geometry.js";
import { chooseCellSize } from "./spatial-grid.js";
import type { ContainerRect, LayoutNode } from "./layout-types.js";

// ---------------------------------------------------------------------------
// The flat scan, as it stood before the index.
// ---------------------------------------------------------------------------

/** Obstacles an edge must not cross: non-endpoint cards + frames neither endpoint is in. */
function flatObstaclesFor(
  from: string,
  to: string,
  nodes: readonly LayoutNode[],
  frames: readonly ContainerRect[],
  framesOfNode: ReadonlyMap<string, ReadonlySet<string>>,
): Rect[] {
  const fFrom = framesOfNode.get(from);
  const fTo = framesOfNode.get(to);
  return [
    ...nodes.filter((n) => n.id !== from && n.id !== to),
    ...frames.filter((f) => !fFrom?.has(f.id) && !fTo?.has(f.id)).flatMap((f) => framePieces(f)),
  ];
}

function flatSegmentCrosses(a: Point, b: Point, rects: readonly Rect[]): boolean {
  for (const r of rects) if (segmentCrossesRect(a, b, r)) return true;
  return false;
}

function flatPolylineClear(path: readonly Point[], rects: readonly Rect[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (flatSegmentCrosses(path[i], path[i + 1], rects)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scene helpers.
// ---------------------------------------------------------------------------

/**
 * Endpoint ids no node on a canvas carries, so a query exempts nothing. Plain
 * ASCII on purpose: a raw NUL in a source file makes grep and rg treat the
 * whole file as binary and skip it (#2216).
 */
const NO_SUCH_FROM = "no-such-node-from";
const NO_SUCH_TO = "no-such-node-to";

/**
 * Deterministic PRNG, so a failing seed is reproducible.
 *
 * The seed goes through a multiplicative hash first. This LCG's first output is
 * dominated by its additive constant, so seeding it with 1, 2, 3 ... produced
 * first draws of 0.2365, 0.2368, 0.2372 and so on: every scene came out with 11
 * or 12 nodes where the generator reads as 2 to 41, and two thirds of them held
 * no frame at all. Hashing the seed spreads the scenes over the range the
 * generator describes.
 */
function rng(seed: number): () => number {
  let s = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function node(id: string, x: number, y: number, width: number, height: number): LayoutNode {
  return { id, label: id, kind: "service", x, y, width, height } as unknown as LayoutNode;
}

/** A group frame covering `pieces` (its `coverage`, #2179), with the bounding box recorded. */
function frame(id: string, pieces: Rect[]): ContainerRect {
  const x = Math.min(...pieces.map((p) => p.x));
  const y = Math.min(...pieces.map((p) => p.y));
  const maxX = Math.max(...pieces.map((p) => p.x + p.width));
  const maxY = Math.max(...pieces.map((p) => p.y + p.height));
  return {
    id,
    label: id,
    x,
    y,
    width: maxX - x,
    height: maxY - y,
    group: true,
    coverage: pieces,
  } as unknown as ContainerRect;
}

/** A whole scene, plus everything both sides of the comparison need. */
interface Scene {
  nodes: LayoutNode[];
  frames: ContainerRect[];
  framesOfNode: Map<string, Set<string>>;
  index: ObstacleIndex;
}

function scene(nodes: LayoutNode[], frames: ContainerRect[]): Scene {
  return {
    nodes,
    frames,
    framesOfNode: buildFramesOfNode(nodes, frames),
    index: ObstacleIndex.build(nodes, frames),
  };
}

/** The two answers for one edge and one segment. */
function compareSegment(
  s: Scene,
  from: string,
  to: string,
  a: Point,
  b: Point,
): { indexed: boolean; flat: boolean } {
  return {
    indexed: s.index.forEdge(from, to).segmentCrosses(a, b),
    flat: flatSegmentCrosses(a, b, flatObstaclesFor(from, to, s.nodes, s.frames, s.framesOfNode)),
  };
}

// ---------------------------------------------------------------------------

describe("ObstacleIndex parity with the flat scan (#2790)", () => {
  it("agrees on random scenes, exemptions and segments", () => {
    let crossings = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const n = 2 + Math.floor(r() * 40);
      const nodes: LayoutNode[] = [];
      for (let i = 0; i < n; i++) {
        nodes.push(
          node(
            `n${i}`,
            Math.round(r() * 2000),
            Math.round(r() * 1500),
            Math.round(r() * 220),
            Math.round(r() * 120),
          ),
        );
      }
      // Frames as bands, the shape `coverage` really takes: a widened boundary
      // frame reaches into another row, so its pieces are wide and flat and a
      // node lands inside one of them.
      const frames: ContainerRect[] = [];
      // Drawn once: as a loop condition it would be re-evaluated, and each
      // iteration would be compared against a fresh number.
      const frameCount = Math.floor(r() * 4);
      for (let f = 0; f < frameCount; f++) {
        const x = Math.round(r() * 800);
        const y = Math.round(r() * 1000);
        const w = Math.round(400 + r() * 1400);
        const h = Math.round(200 + r() * 400);
        frames.push(
          frames.length % 2 === 0
            ? frame(`f${f}`, [{ x, y, width: w, height: h }])
            : frame(`f${f}`, [
                { x, y, width: w, height: h / 2 },
                { x: x + 40, y: y + h, width: w, height: h / 2 },
              ]),
        );
      }
      const s = scene(nodes, frames);
      for (let q = 0; q < 300; q++) {
        const from = nodes[Math.floor(r() * nodes.length)].id;
        const to = nodes[Math.floor(r() * nodes.length)].id;
        // A mix of free segments, axis-aligned ones (what the routers actually
        // produce) and ones anchored on a card's border.
        const anchor = nodes[Math.floor(r() * nodes.length)];
        const a: Point =
          r() < 0.5
            ? { x: r() * 2400 - 200, y: r() * 1800 - 200 }
            : { x: anchor.x + anchor.width, y: anchor.y + anchor.height / 2 };
        const b: Point =
          r() < 0.4
            ? { x: a.x, y: r() * 1800 - 200 }
            : r() < 0.7
              ? { x: r() * 2400 - 200, y: a.y }
              : { x: r() * 2400 - 200, y: r() * 1800 - 200 };
        const { indexed, flat } = compareSegment(s, from, to, a, b);
        if (flat) crossings++;
        expect(
          indexed,
          `seed=${seed} q=${q} ${from}->${to} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
        ).toBe(flat);
      }
    }
    // Guard against a vacuous pass: the scenes have to produce real crossings.
    expect(crossings).toBeGreaterThan(1000);
  });

  it("agrees when rects and segments land exactly on cell boundaries", () => {
    // A regular lattice of equal cards, whose own size is what `chooseCellSize`
    // picks, so card borders and cell borders coincide. Segments are then run
    // along and across those exact lines, where an off-by-one in the grid's
    // clamping or in its half-open cell arithmetic would show.
    const step = 32;
    const size = 16;
    const nodes: LayoutNode[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) nodes.push(node(`n${i}-${j}`, i * step, j * step, size, size));
    }
    const s = scene(nodes, []);
    const sizes = nodes.map((n) => Math.max(n.width, n.height));
    const extent = 7 * step + size;
    const cell = chooseCellSize(sizes, extent, extent);
    // The lattice is built so the cell size is the card size; if that ever
    // stops holding the scene no longer probes boundaries and should be fixed.
    expect(cell).toBe(size);

    const lines: number[] = [];
    for (let k = -1; k <= (8 * step) / cell + 1; k++) lines.push(k * cell);
    let crossings = 0;
    for (const fixed of lines) {
      for (const other of lines) {
        for (const [a, b] of [
          [
            { x: fixed, y: -64 },
            { x: fixed, y: extent + 64 },
          ],
          [
            { x: -64, y: fixed },
            { x: extent + 64, y: fixed },
          ],
          [
            { x: fixed, y: other },
            { x: other, y: fixed },
          ],
        ] as [Point, Point][]) {
          const { indexed, flat } = compareSegment(s, "n0-0", "n7-7", a, b);
          if (flat) crossings++;
          expect(indexed, `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`).toBe(flat);
        }
      }
    }
    expect(crossings).toBeGreaterThan(0);
  });

  it("drops no single obstacle: one rect at a time, the index answers like the clip", () => {
    // The boolean surface above states the superset property as an OR over the
    // whole canvas. Here it is stated per obstacle: an index holding exactly one
    // rect must report a crossing whenever the exact clip does, for segments
    // that lie inside, outside, along and exactly on that rect's borders.
    const cell = 16;
    const rects: Rect[] = [
      { x: 0, y: 0, width: cell, height: cell },
      { x: cell, y: cell, width: cell * 3, height: cell * 2 },
      { x: -cell * 4, y: cell * 7, width: cell * 9, height: cell },
      { x: 1000, y: 1000, width: 1, height: 1 },
      { x: 5, y: 5, width: 0, height: 40 },
      { x: 5, y: 5, width: 40, height: 0 },
    ];
    const probes: Point[] = [];
    for (let k = -2; k <= 8; k++) probes.push({ x: k * cell, y: k * cell });
    for (let k = -2; k <= 8; k++) probes.push({ x: k * cell, y: cell * 2 });
    for (let k = -2; k <= 8; k++) probes.push({ x: cell * 2, y: k * cell });
    probes.push({ x: 1000, y: 1000 }, { x: 1001, y: 1001 }, { x: 999999, y: 999999 });
    let hits = 0;
    for (const r of rects) {
      const solo = ObstacleIndex.build([node("solo", r.x, r.y, r.width, r.height)], []);
      const q = solo.forEdge("from", "to");
      for (const a of probes) {
        for (const b of probes) {
          const exact = segmentCrossesRect(a, b, r);
          if (exact) hits++;
          expect(q.segmentCrosses(a, b), `${JSON.stringify(r)} ${JSON.stringify([a, b])}`).toBe(
            exact,
          );
        }
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("agrees on degenerate scenes", () => {
    const nodes = [
      node("zero", 100, 100, 0, 0),
      node("thin", 200, 100, 0, 300),
      node("flat", 300, 100, 300, 0),
      node("dup-a", 400, 400, 100, 100),
      node("dup-b", 400, 400, 100, 100),
      node("far", 100000, 100000, 50, 50),
      node("neg", -500, -500, 80, 80),
    ];
    const frames = [
      frame("point", [{ x: 300, y: 300, width: 0, height: 0 }]),
      frame("big", [{ x: -1000, y: -1000, width: 4000, height: 4000 }]),
      frame("split", [
        { x: 0, y: 0, width: 200, height: 200 },
        { x: 99900, y: 99900, width: 300, height: 300 },
      ]),
    ];
    const s = scene(nodes, frames);
    // The exemption really engages: `zero` sits inside `big` and inside the near
    // piece of `split`, so neither is an obstacle for its edges while both are
    // for everyone else's.
    expect(s.framesOfNode.get("zero")).toEqual(new Set(["big", "split"]));
    expect(s.framesOfNode.get("far")).toEqual(new Set(["split"]));

    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 450, y: 400 },
      { x: 450, y: 500 },
      { x: 400, y: 450 },
      { x: 500, y: 450 },
      { x: -2000, y: -2000 },
      { x: 200000, y: 200000 },
      { x: 100000, y: 100025 },
    ];
    for (const from of ["zero", "dup-a", "missing"]) {
      for (const to of ["dup-b", "far", "missing"]) {
        for (const a of points) {
          for (const b of points) {
            const { indexed, flat } = compareSegment(s, from, to, a, b);
            expect(indexed, `${from}->${to} ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(flat);
          }
        }
      }
    }
  });

  it("agrees on whole polylines, not only single segments", () => {
    const r = rng(99);
    const nodes = Array.from({ length: 25 }, (_, i) =>
      node(`n${i}`, Math.round(r() * 1200), Math.round(r() * 900), 160, 90),
    );
    const s = scene(nodes, []);
    let blocked = 0;
    for (let q = 0; q < 500; q++) {
      // The staircase shape the router produces: alternating horizontal and
      // vertical runs.
      const path: Point[] = [];
      let p: Point = { x: r() * 1400, y: r() * 1100 };
      path.push(p);
      for (let i = 1; i < 2 + Math.floor(r() * 4); i++) {
        p = i % 2 === 1 ? { x: r() * 1400, y: p.y } : { x: p.x, y: r() * 1100 };
        path.push(p);
      }
      const from = nodes[Math.floor(r() * nodes.length)].id;
      const to = nodes[Math.floor(r() * nodes.length)].id;
      const indexed = s.index.forEdge(from, to).polylineClear(path);
      const flat = flatPolylineClear(
        path,
        flatObstaclesFor(from, to, s.nodes, s.frames, s.framesOfNode),
      );
      if (!flat) blocked++;
      expect(indexed, `q=${q} ${from}->${to}`).toBe(flat);
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("ObstacleIndex preserves the per-endpoint exemption (#2179)", () => {
  // Two boundary frames that overlap, and a card inside both — the geometry
  // #2179 introduced. `alpha` is widened into a second band; `beta` shares the
  // first band's right-hand part with it.
  const alpha = frame("alpha", [
    { x: 0, y: 0, width: 300, height: 100 },
    { x: 0, y: 200, width: 300, height: 100 },
  ]);
  const beta = frame("beta", [{ x: 200, y: 0, width: 300, height: 100 }]);
  const nodes = [
    node("a", 10, 10, 50, 50), // alpha only, first band
    node("b", 10, 210, 50, 50), // alpha only, widened band
    node("c", 400, 10, 50, 50), // beta only
    node("shared", 210, 10, 50, 50), // in the overlap: alpha and beta
    node("out", 600, 600, 50, 50), // in neither
    node("out2", 700, 600, 50, 50),
  ];
  const s = scene(nodes, [alpha, beta]);

  /** A short segment through the middle of one of a frame's pieces. */
  const through = (piece: Rect): [Point, Point] => [
    { x: piece.x + piece.width / 2 - 5, y: piece.y + piece.height / 2 },
    { x: piece.x + piece.width / 2 + 5, y: piece.y + piece.height / 2 },
  ];

  it("derives membership from coverage, including the shared card", () => {
    expect(s.framesOfNode.get("a")).toEqual(new Set(["alpha"]));
    expect(s.framesOfNode.get("b")).toEqual(new Set(["alpha"]));
    expect(s.framesOfNode.get("c")).toEqual(new Set(["beta"]));
    expect(s.framesOfNode.get("shared")).toEqual(new Set(["alpha", "beta"]));
    expect(s.framesOfNode.get("out")).toEqual(new Set());
  });

  it.each([
    // [from, to, frame piece crossed, is it an obstacle for this edge?]
    ["a", "b", alpha.coverage![1], false], // both endpoints in alpha, widened band included
    ["a", "b", beta.coverage![0], true], // beta encloses neither
    ["a", "c", beta.coverage![0], false], // one endpoint in each: both exempt
    ["a", "c", alpha.coverage![0], false],
    ["out", "out2", alpha.coverage![0], true], // neither endpoint in either frame
    ["out", "out2", beta.coverage![0], true],
    ["shared", "a", beta.coverage![0], false], // #2179: running through the overlap
    ["shared", "a", alpha.coverage![1], false],
    ["out", "c", beta.coverage![0], false], // exemption travels with one endpoint
    ["out", "c", alpha.coverage![0], true],
  ] as [string, string, Rect, boolean][])(
    "%s -> %s: the frame piece blocks = %s",
    (from, to, piece, blocks) => {
      const [a, b] = through(piece);
      const { indexed, flat } = compareSegment(s, from, to, a, b);
      expect(indexed).toBe(blocks);
      // …and the old predicate says exactly the same thing.
      expect(flat).toBe(blocks);
    },
  );

  it("exempts an edge's own endpoint cards and no others", () => {
    const probe = (id: string): [Point, Point] => {
      const n = nodes.find((x) => x.id === id)!;
      return [
        { x: n.x - 5, y: n.y + n.height / 2 },
        { x: n.x + n.width + 5, y: n.y + n.height / 2 },
      ];
    };
    // `out` is not an endpoint of a -> b, so its card blocks.
    expect(s.index.forEdge("a", "b").segmentCrosses(...probe("out"))).toBe(true);
    // Its own card does not, from either end.
    expect(s.index.forEdge("out", "b").segmentCrosses(...probe("out"))).toBe(false);
    expect(s.index.forEdge("a", "out").segmentCrosses(...probe("out"))).toBe(false);
  });

  it("exempts an in-place-expanded container from its own boundary frame (#1923)", () => {
    // The expanded container is an endpoint that is not a card; it belongs to
    // its own frame and to nothing else, which is what `resolveGroupBoxes` set
    // up before the index took the map over.
    const expanded = new Map([["Svc", alpha]]);
    const index = ObstacleIndex.build(nodes, [alpha, beta], expanded);
    const [a, b] = through(alpha.coverage![0]);
    expect(index.forEdge("Svc", "out").segmentCrosses(a, b)).toBe(false);
    const [c, d] = through(beta.coverage![0]);
    expect(index.forEdge("Svc", "out").segmentCrosses(c, d)).toBe(true);
  });
});

describe("the index holds the whole obstacle set, not a route-shape subset (TPL-1954)", () => {
  // A route shape must never decide which obstacles it is judged against. The
  // fence is stated as: for an edge that exempts nothing, *every* card and
  // *every* frame piece on the canvas answers as an obstacle. Filtering the
  // index's input — by candidate, by pass, by waypoint count — drops one of
  // these and fails the assertion.
  const frames = [
    frame("band", [
      { x: 0, y: 400, width: 900, height: 80 },
      { x: 200, y: 600, width: 500, height: 80 },
    ]),
    frame("plain", [{ x: 0, y: 800, width: 400, height: 120 }]),
  ];
  const nodes = Array.from({ length: 12 }, (_, i) =>
    node(`n${i}`, (i % 4) * 220, Math.floor(i / 4) * 120, 160, 80),
  );
  const index = ObstacleIndex.build(nodes, frames);
  const all = index.forEdge(NO_SUCH_FROM, NO_SUCH_TO);

  it.each(nodes.map((n) => [n.id, n] as const))("card %s is indexed", (_id, n) => {
    expect(
      all.segmentCrosses(
        { x: n.x - 10, y: n.y + n.height / 2 },
        { x: n.x + n.width + 10, y: n.y + n.height / 2 },
      ),
    ).toBe(true);
  });

  it.each(frames.flatMap((f) => framePieces(f).map((p, i) => [`${f.id}[${i}]`, p] as const)))(
    "frame piece %s is indexed",
    (_id, p) => {
      expect(
        all.segmentCrosses(
          { x: p.x + p.width / 2, y: p.y - 10 },
          { x: p.x + p.width / 2, y: p.y + p.height + 10 },
        ),
      ).toBe(true);
    },
  );

  it("every route shape is judged against that same set", () => {
    // The three shapes the chain can produce — a straight line, a 2-waypoint
    // gutter route and a staircase — asked of one query object. Each must match
    // the flat scan over the unfiltered canvas, so no shape is measured against
    // a smaller set than another.
    const framesOfNode = buildFramesOfNode(nodes, frames);
    const flat = flatObstaclesFor(NO_SUCH_FROM, NO_SUCH_TO, nodes, frames, framesOfNode);
    expect(flat).toHaveLength(nodes.length + frames.flatMap(framePieces).length);
    const shapes: Point[][] = [
      [
        { x: -50, y: 440 },
        { x: 950, y: 440 },
      ],
      [
        { x: 80, y: 40 },
        { x: 1000, y: 40 },
        { x: 1000, y: 840 },
        { x: 200, y: 840 },
      ],
      [
        { x: 80, y: 40 },
        { x: 190, y: 40 },
        { x: 190, y: 300 },
        { x: 430, y: 300 },
        { x: 430, y: 700 },
        { x: 900, y: 700 },
      ],
    ];
    for (const path of shapes) {
      expect(all.polylineClear(path)).toBe(flatPolylineClear(path, flat));
    }
  });
});
