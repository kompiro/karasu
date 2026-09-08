import { describe, it, expect } from "vitest";
import { computeCrossingMarks, HOP_RADIUS, HOP_CLUSTER_GAP } from "./crossing-marks.js";
import type { CrossingMarks, HopMark, JunctionMark, LayoutEdge } from "./layout-types.js";

/** Build a LayoutEdge from a polyline of `[x, y]` points. */
function poly(points: [number, number][], extra: Partial<LayoutEdge> = {}): LayoutEdge {
  const pts = points.map(([x, y]) => ({ x, y }));
  return {
    from: "A",
    to: "B",
    fromPoint: pts[0],
    toPoint: pts[pts.length - 1],
    waypoints: pts.slice(1, -1),
    ...extra,
  };
}

describe("computeCrossingMarks (#1859 P2c-C)", () => {
  it("marks a hop where a horizontal segment crosses a vertical of another edge", () => {
    const h = poly([
      [0, 50],
      [100, 50],
    ]);
    const v = poly(
      [
        [50, 0],
        [50, 100],
      ],
      { from: "C", to: "D" },
    );
    const { hops, junctions } = computeCrossingMarks([h, v]);
    expect(hops).toHaveLength(1);
    expect(hops[0]).toMatchObject({ x: 50, y: 50, halfWidth: HOP_RADIUS });
    expect(junctions).toHaveLength(0);
  });

  it("does NOT mark a hop where a stub ends on a vertical (T-junction / trunk join)", () => {
    // Two trunked edges join a shared spine at x=50. Each horizontal stub *ends*
    // on the spine (endpoint, not interior) — a connection, not a crossing.
    const a = poly(
      [
        [0, 50],
        [50, 50],
        [50, 100],
      ],
      { from: "A", to: "DB", trunkId: "DB" },
    );
    const b = poly(
      [
        [0, 80],
        [50, 80],
        [50, 100],
      ],
      { from: "B", to: "DB", trunkId: "DB" },
    );
    const { hops, junctions } = computeCrossingMarks([a, b]);
    expect(hops).toHaveLength(0);
    // Only the *lower* stub (y=80) is a real merge: the shared spine continues
    // above it (A joins at y=50 and runs down). The topmost stub (y=50) is the
    // trunk head — a plain L-corner — so it gets NO junction dot. `edge` is the
    // joining stub's index (b = 1) so the dot is coloured like that edge.
    expect(junctions).toEqual([{ x: 50, y: 80, edge: 1 }]);
  });

  it("does not dot the trunk head (topmost stub is an L-corner, not a merge)", () => {
    // Three stubs into one spine at x=60: only the two lower elbows are T-merges;
    // the head (y=20) is a lone corner.
    const mk = (fromY: number, from: string) =>
      poly(
        [
          [0, fromY],
          [60, fromY],
          [60, 200],
        ],
        { from, to: "DB", trunkId: "DB" },
      );
    const { junctions } = computeCrossingMarks([mk(20, "A"), mk(70, "B"), mk(120, "C")]);
    expect(junctions).toEqual([
      { x: 60, y: 70, edge: 1 },
      { x: 60, y: 120, edge: 2 },
    ]);
  });

  it("dedups junctions that share a coordinate", () => {
    const a = poly(
      [
        [0, 50],
        [50, 50],
        [50, 100],
      ],
      { from: "A", to: "DB", trunkId: "DB" },
    );
    const b = poly(
      [
        [0, 50],
        [50, 50],
        [50, 90],
      ],
      { from: "B", to: "DB", trunkId: "DB" },
    );
    const { junctions } = computeCrossingMarks([a, b]);
    expect(junctions).toEqual([{ x: 50, y: 50, edge: 0 }]);
  });

  it("clusters nearby crossings on one horizontal into a single wide hop", () => {
    const h = poly([
      [0, 30],
      [100, 30],
    ]);
    // Verticals at x=50 and x=55 (gap 5 <= HOP_CLUSTER_GAP) → one wide hop.
    const v1 = poly(
      [
        [50, 0],
        [50, 60],
      ],
      { from: "C", to: "D" },
    );
    const v2 = poly(
      [
        [55, 0],
        [55, 60],
      ],
      { from: "E", to: "F" },
    );
    expect(HOP_CLUSTER_GAP).toBeGreaterThanOrEqual(5);
    const { hops } = computeCrossingMarks([h, v1, v2]);
    expect(hops).toHaveLength(1);
    expect(hops[0]).toMatchObject({ x: 52.5, y: 30, halfWidth: 2.5 + HOP_RADIUS });
  });

  it("keeps distant crossings on one horizontal as separate hops", () => {
    const h = poly([
      [0, 30],
      [200, 30],
    ]);
    const near = poly(
      [
        [50, 0],
        [50, 60],
      ],
      { from: "C", to: "D" },
    );
    const far = poly(
      [
        [150, 0],
        [150, 60],
      ],
      { from: "E", to: "F" },
    );
    const { hops } = computeCrossingMarks([h, near, far]);
    expect(hops).toHaveLength(2);
    expect(hops.map((m) => m.x)).toEqual([50, 150]);
  });

  it("dedups identical hops from two collinear horizontals crossing one vertical", () => {
    // Two different edges' horizontals lie on the same y and are both crossed by
    // one vertical at x=50 → one arc, not two stacked identical <path>s.
    const h1 = poly(
      [
        [0, 30],
        [100, 30],
      ],
      { from: "A", to: "B" },
    );
    const h2 = poly(
      [
        [0, 30],
        [100, 30],
      ],
      { from: "C", to: "D" },
    );
    const v = poly(
      [
        [50, 0],
        [50, 60],
      ],
      { from: "E", to: "F" },
    );
    const { hops } = computeCrossingMarks([h1, h2, v]);
    // Kept once, tagged with the first horizontal's edge index (h1 = 0); a
    // horizontal host is angle 0 (axis-aligned hops render as before #1939).
    expect(hops).toEqual([{ x: 50, y: 30, halfWidth: HOP_RADIUS, angle: 0, edge: 0 }]);
  });

  it("ignores ghost and cyclic edges", () => {
    const ghost = poly(
      [
        [0, 50],
        [100, 50],
      ],
      { ghost: true },
    );
    const cyclic = poly(
      [
        [0, 50],
        [100, 50],
      ],
      { cyclic: true },
    );
    const v = poly(
      [
        [50, 0],
        [50, 100],
      ],
      { from: "C", to: "D" },
    );
    expect(computeCrossingMarks([ghost, v]).hops).toHaveLength(0);
    expect(computeCrossingMarks([cyclic, v]).hops).toHaveLength(0);
  });

  it("marks a diagonal crossing with an oriented hop (#1939 Part 1)", () => {
    // A diagonal edge crossing a vertical is a real crossing. The hop rides the
    // more horizontal segment (the 45° diagonal, |ux| > 0 vs the vertical's 0)
    // and is oriented along it (angle 45°) — generalises the axis-aligned case.
    const diagonal = poly([
      [0, 0],
      [100, 100],
    ]);
    const v = poly(
      [
        [50, 0],
        [50, 100],
      ],
      { from: "C", to: "D" },
    );
    const { hops } = computeCrossingMarks([diagonal, v]);
    expect(hops).toEqual([{ x: 50, y: 50, halfWidth: HOP_RADIUS, angle: 45, edge: 0 }]);
  });

  it("collapses 3+ edges concurrent at one point to a single hop (no stacked arcs)", () => {
    // A horizontal, a vertical, and a diagonal all pass through (50, 50). The
    // three pairwise crossings share that point; dedup keeps one arc, not three.
    const h = poly(
      [
        [0, 50],
        [100, 50],
      ],
      { from: "A", to: "B" },
    );
    const v = poly(
      [
        [50, 0],
        [50, 100],
      ],
      { from: "C", to: "D" },
    );
    const d = poly(
      [
        [0, 0],
        [100, 100],
      ],
      { from: "E", to: "F" },
    );
    const { hops } = computeCrossingMarks([h, v, d]);
    expect(hops).toHaveLength(1);
    expect(hops[0]).toMatchObject({ x: 50, y: 50 });
  });

  it("does not mark an edge crossing its own segments", () => {
    // A single L-shaped edge: its own H and V meet at the corner (endpoint), so
    // no self-hop.
    const l = poly([
      [0, 50],
      [50, 50],
      [50, 100],
    ]);
    expect(computeCrossingMarks([l]).hops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spatial-prefilter parity (#2760). `computeCrossingMarks` now enumerates the
// segment pairs it tests from a uniform grid instead of the full `i < j` loop.
// The reference below is the pre-#2760 pass, copied verbatim (its own
// `segIntersection`, the all-pairs loop with the strict AABB reject, the string
// hop key) so this file stays self-contained: whatever the grid does, the marks
// must come out identical — same pairs found, same hop clusters, same order.
// ---------------------------------------------------------------------------

/** Small seeded PRNG (mulberry32) so a failing case is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number };
type RefSeg = { a: Pt; b: Pt; edge: number; ux: number; uy: number };

function referenceCrossingMarks(edges: LayoutEdge[]): CrossingMarks {
  const EPS = 1e-6;
  const segIntersection = (s1: RefSeg, s2: RefSeg): Pt | null => {
    const rx = s1.b.x - s1.a.x;
    const ry = s1.b.y - s1.a.y;
    const sx = s2.b.x - s2.a.x;
    const sy = s2.b.y - s2.a.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < EPS) return null;
    const qpx = s2.a.x - s1.a.x;
    const qpy = s2.a.y - s1.a.y;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    const len1 = Math.hypot(rx, ry);
    const len2 = Math.hypot(sx, sy);
    if (t * len1 <= EPS || (1 - t) * len1 <= EPS || u * len2 <= EPS || (1 - u) * len2 <= EPS) {
      return null;
    }
    return { x: s1.a.x + t * rx, y: s1.a.y + t * ry };
  };

  const segs: RefSeg[] = [];
  const trunkElbows = new Map<string, { x: number; entries: { y: number; edge: number }[] }>();
  edges.forEach((edge, edgeIdx) => {
    if (edge.ghost || edge.cyclic) return;
    const pts: Pt[] = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < EPS) continue;
      let ux = (b.x - a.x) / len;
      let uy = (b.y - a.y) / len;
      if (ux < -EPS || (Math.abs(ux) < EPS && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      segs.push({ a, b, edge: edgeIdx, ux, uy });
    }
    if (edge.trunkId !== undefined && edge.waypoints && edge.waypoints.length > 0) {
      const elbow = edge.waypoints[0];
      const key = `${edge.trunkId}@${elbow.x}`;
      const group = trunkElbows.get(key);
      if (group) group.entries.push({ y: elbow.y, edge: edgeIdx });
      else trunkElbows.set(key, { x: elbow.x, entries: [{ y: elbow.y, edge: edgeIdx }] });
    }
  });

  const crossingsPerHost = new Map<RefSeg, { coord: number; point: Pt }[]>();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      if (s1.edge === s2.edge) continue;
      if (
        Math.min(s1.a.x, s1.b.x) > Math.max(s2.a.x, s2.b.x) ||
        Math.max(s1.a.x, s1.b.x) < Math.min(s2.a.x, s2.b.x) ||
        Math.min(s1.a.y, s1.b.y) > Math.max(s2.a.y, s2.b.y) ||
        Math.max(s1.a.y, s1.b.y) < Math.min(s2.a.y, s2.b.y)
      ) {
        continue;
      }
      const p = segIntersection(s1, s2);
      if (!p) continue;
      const host =
        s1.ux > s2.ux + EPS || (Math.abs(s1.ux - s2.ux) < EPS && s1.edge <= s2.edge) ? s1 : s2;
      const coord = p.x * host.ux + p.y * host.uy;
      const list = crossingsPerHost.get(host);
      if (list) list.push({ coord, point: p });
      else crossingsPerHost.set(host, [{ coord, point: p }]);
    }
  }

  const hopByKey = new Map<string, HopMark>();
  const addHop = (mark: HopMark) => {
    const key = `${mark.x},${mark.y}`;
    const existing = hopByKey.get(key);
    if (!existing || mark.halfWidth > existing.halfWidth) hopByKey.set(key, mark);
  };
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  for (const [host, crossings] of crossingsPerHost) {
    crossings.sort((a, b) => a.coord - b.coord);
    const angle = round((Math.atan2(host.uy, host.ux) * 180) / Math.PI);
    let lo = 0;
    const flush = (hi: number) => {
      const pMin = crossings[lo].point;
      const pMax = crossings[hi].point;
      addHop({
        x: round((pMin.x + pMax.x) / 2),
        y: round((pMin.y + pMax.y) / 2),
        halfWidth: round(Math.hypot(pMax.x - pMin.x, pMax.y - pMin.y) / 2 + HOP_RADIUS),
        angle,
        edge: host.edge,
      });
    };
    for (let k = 1; k < crossings.length; k++) {
      if (crossings[k].coord - crossings[k - 1].coord > HOP_CLUSTER_GAP) {
        flush(k - 1);
        lo = k;
      }
    }
    flush(crossings.length - 1);
  }
  const hops = [...hopByKey.values()];

  const junctionSeen = new Set<string>();
  const junctions: JunctionMark[] = [];
  for (const { x, entries } of trunkElbows.values()) {
    const minY = Math.min(...entries.map((e) => e.y));
    const headCount = entries.filter((e) => Math.abs(e.y - minY) < EPS).length;
    for (const { y, edge } of entries) {
      const isMerge = y > minY + EPS || (Math.abs(y - minY) < EPS && headCount >= 2);
      if (!isMerge) continue;
      const key = `${x},${y}`;
      if (junctionSeen.has(key)) continue;
      junctionSeen.add(key);
      junctions.push({ x, y, edge });
    }
  }

  hops.sort((a, b) => a.y - b.y || a.x - b.x);
  junctions.sort((a, b) => a.y - b.y || a.x - b.x);
  return { hops, junctions };
}

/**
 * Random edge set biased towards the cases a prefilter can get wrong: a coarse
 * lattice (so segments touch end-to-end, share points, run collinear, and
 * three or more meet at one point), axis-aligned and diagonal runs, zero-length
 * segments, trunked stubs (junctions), ghost/cyclic edges (skipped), and the
 * occasional huge offset or hairline-scale set.
 */
function randomEdges(rnd: () => number): LayoutEdge[] {
  const lattice = 10;
  const span = 40 + Math.floor(rnd() * 200);
  const scale = rnd() < 0.05 ? 1e-3 : rnd() < 0.05 ? 1e5 : 1;
  const offset = rnd() < 0.1 ? 1e7 : 0;
  const coord = (): number => {
    const r = rnd();
    const v = r < 0.7 ? Math.floor(rnd() * (span / lattice + 1)) * lattice : rnd() * span;
    return v * scale + offset;
  };
  const edgeCount = 2 + Math.floor(rnd() * 24);
  const edges: LayoutEdge[] = [];
  for (let e = 0; e < edgeCount; e++) {
    const pointCount = 2 + Math.floor(rnd() * 4);
    const pts: [number, number][] = [];
    let x = coord();
    let y = coord();
    pts.push([x, y]);
    for (let k = 1; k < pointCount; k++) {
      const kind = rnd();
      if (kind < 0.35)
        x = coord(); // horizontal step
      else if (kind < 0.7)
        y = coord(); // vertical step
      else if (kind < 0.8) {
        /* zero-length: repeat the point */
      } else {
        x = coord();
        y = coord(); // diagonal
      }
      pts.push([x, y]);
    }
    const extra: Partial<LayoutEdge> = { from: `N${e}`, to: `N${(e + 1) % edgeCount}` };
    const flag = rnd();
    if (flag < 0.08) extra.ghost = true;
    else if (flag < 0.14) extra.cyclic = true;
    else if (flag < 0.4) extra.trunkId = `T${Math.floor(rnd() * 3)}`;
    edges.push(poly(pts, extra));
  }
  return edges;
}

describe("computeCrossingMarks spatial prefilter parity (#2760)", () => {
  it("returns exactly the all-pairs result on random edge sets", () => {
    const CASES = 500;
    for (let seed = 1; seed <= CASES; seed++) {
      const edges = randomEdges(mulberry32(seed));
      const actual = computeCrossingMarks(edges);
      const expected = referenceCrossingMarks(edges);
      expect(actual, `seed ${seed}`).toStrictEqual(expected);
    }
  });

  it("matches the reference on degenerate inputs", () => {
    const cases: LayoutEdge[][] = [
      [],
      [
        poly([
          [0, 0],
          [100, 0],
        ]),
      ],
      [
        poly([
          [5, 5],
          [5, 5],
        ]),
      ],
      [
        poly([
          [5, 5],
          [5, 5],
        ]),
        poly(
          [
            [5, 5],
            [5, 5],
          ],
          { from: "C", to: "D" },
        ),
      ],
      // Collinear overlaps only — never a point crossing.
      [
        poly([
          [0, 0],
          [100, 0],
        ]),
        poly(
          [
            [50, 0],
            [150, 0],
          ],
          { from: "C", to: "D" },
        ),
        poly(
          [
            [20, 0],
            [20, 0],
            [80, 0],
          ],
          { from: "E", to: "F" },
        ),
      ],
      // Huge coordinates, tiny crossing.
      [
        poly([
          [1e9, 1e9 + 0.5],
          [1e9 + 1, 1e9 + 0.5],
        ]),
        poly(
          [
            [1e9 + 0.5, 1e9],
            [1e9 + 0.5, 1e9 + 1],
          ],
          { from: "C", to: "D" },
        ),
      ],
      // Everything meets at one point.
      [
        poly([
          [0, 50],
          [100, 50],
        ]),
        poly(
          [
            [50, 0],
            [50, 100],
          ],
          { from: "C", to: "D" },
        ),
        poly(
          [
            [0, 0],
            [100, 100],
          ],
          { from: "E", to: "F" },
        ),
        poly(
          [
            [0, 100],
            [100, 0],
          ],
          { from: "G", to: "H" },
        ),
      ],
    ];
    for (const edges of cases) {
      expect(computeCrossingMarks(edges)).toStrictEqual(referenceCrossingMarks(edges));
    }
  });
});
