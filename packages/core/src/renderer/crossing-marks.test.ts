import { describe, it, expect } from "vitest";
import { computeCrossingMarks, HOP_RADIUS, HOP_CLUSTER_GAP } from "./crossing-marks.js";
import type { LayoutEdge } from "./layout-types.js";

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
