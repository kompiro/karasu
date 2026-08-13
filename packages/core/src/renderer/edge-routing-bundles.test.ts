import { describe, it, expect } from "vitest";
import { markParallelBundles } from "./edge-routing-bundles.js";
import type { LayoutEdge } from "./layout-types.js";

function edge(partial: Partial<LayoutEdge>): LayoutEdge {
  return {
    from: "A",
    to: "B",
    fromPoint: { x: 0, y: 0 },
    toPoint: { x: 0, y: 100 },
    ...partial,
  };
}

describe("markParallelBundles", () => {
  it("annotates parallel edges with bundleIndex / bundleSize in input order", () => {
    const e1 = edge({ label: "create" });
    const e2 = edge({ label: "update" });
    markParallelBundles([e1, e2]);
    expect(e1.bundleIndex).toBe(0);
    expect(e1.bundleSize).toBe(2);
    expect(e2.bundleIndex).toBe(1);
    expect(e2.bundleSize).toBe(2);
  });

  it("leaves single edges untouched", () => {
    const e1 = edge({ label: "only" });
    markParallelBundles([e1]);
    expect(e1.bundleIndex).toBeUndefined();
    expect(e1.bundleSize).toBeUndefined();
  });

  it("treats sync and async between same pair as one bundle", () => {
    const sync = edge({ kind: "sync" });
    const async = edge({ kind: "async" });
    markParallelBundles([sync, async]);
    expect(sync.bundleSize).toBe(2);
    expect(async.bundleSize).toBe(2);
  });

  it("treats `(A,B)` and `(B,A)` as separate groups", () => {
    const ab = edge({ from: "A", to: "B" });
    const ba = edge({ from: "B", to: "A" });
    markParallelBundles([ab, ba]);
    expect(ab.bundleSize).toBeUndefined();
    expect(ba.bundleSize).toBeUndefined();
  });

  it("does not move ports that distributePorts already spread", () => {
    const e1 = edge({
      fromPoint: { x: 60, y: 100 },
      toPoint: { x: 60, y: 200 },
    });
    const e2 = edge({
      fromPoint: { x: 120, y: 100 },
      toPoint: { x: 120, y: 200 },
    });
    markParallelBundles([e1, e2]);
    expect(e1.fromPoint).toEqual({ x: 60, y: 100 });
    expect(e1.toPoint).toEqual({ x: 60, y: 200 });
    expect(e2.fromPoint).toEqual({ x: 120, y: 100 });
    expect(e2.toPoint).toEqual({ x: 120, y: 200 });
  });

  it("nudges a regular bundle whose ports were never distributed (#2477)", () => {
    // Both endpoints are services expanded in place, so `distributePorts` —
    // which looks endpoints up in `layoutNodes` — never saw these edges and
    // they are still drawn on the same line.
    const sync = edge({ kind: "sync", fromPoint: { x: 140, y: 188 }, toPoint: { x: 140, y: 308 } });
    const async = edge({
      kind: "async",
      fromPoint: { x: 140, y: 188 },
      toPoint: { x: 140, y: 308 },
    });
    markParallelBundles([sync, async]);
    expect(sync.fromPoint.x).toBeCloseTo(146);
    expect(sync.toPoint.x).toBeCloseTo(146);
    expect(async.fromPoint.x).toBeCloseTo(134);
    expect(async.toPoint.x).toBeCloseTo(134);
    // Only the perpendicular axis moves.
    expect(sync.fromPoint.y).toBeCloseTo(188);
    expect(async.toPoint.y).toBeCloseTo(308);
  });

  it("moves a co-located routed edge's waypoints with its ports", () => {
    const wp = () => [
      { x: 40, y: 100 },
      { x: 40, y: 200 },
    ];
    const e1 = edge({ fromPoint: { x: 0, y: 100 }, toPoint: { x: 0, y: 200 }, waypoints: wp() });
    const e2 = edge({ fromPoint: { x: 0, y: 100 }, toPoint: { x: 0, y: 200 }, waypoints: wp() });
    markParallelBundles([e1, e2]);
    // Downward edge → perpendicular is the x axis; the polyline keeps its shape.
    expect(e1.waypoints).toEqual([
      { x: 46, y: 100 },
      { x: 46, y: 200 },
    ]);
    expect(e2.waypoints).toEqual([
      { x: 34, y: 100 },
      { x: 34, y: 200 },
    ]);
    expect(e1.fromPoint.x).toBeCloseTo(6);
    expect(e2.fromPoint.x).toBeCloseTo(-6);
  });

  it("leaves an edge alone when only its siblings are stacked", () => {
    const stackedA = edge({ fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    const stackedB = edge({ fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    const spread = edge({ fromPoint: { x: 80, y: 0 }, toPoint: { x: 80, y: 100 } });
    markParallelBundles([stackedA, stackedB, spread]);
    expect(spread.fromPoint).toEqual({ x: 80, y: 0 });
    expect(spread.toPoint).toEqual({ x: 80, y: 100 });
    // The two that were on one line no longer are.
    expect(stackedA.fromPoint.x).not.toBeCloseTo(stackedB.fromPoint.x);
  });

  it("treats edges with the same ports but different routes as separated", () => {
    const straight = edge({ fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    const routed = edge({
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 0, y: 100 },
      waypoints: [
        { x: 60, y: 20 },
        { x: 60, y: 80 },
      ],
    });
    markParallelBundles([straight, routed]);
    expect(straight.fromPoint).toEqual({ x: 0, y: 0 });
    expect(routed.waypoints).toEqual([
      { x: 60, y: 20 },
      { x: 60, y: 80 },
    ]);
  });

  it("nudges ghost edges perpendicular to the edge direction", () => {
    // Vertical edge from (100, 0) to (100, 100). Perpendicular is x-axis.
    // For N=2, offsets are -BUNDLE_GAP/2 and +BUNDLE_GAP/2 = ±6.
    const e1 = edge({
      ghost: true,
      fromPoint: { x: 100, y: 0 },
      toPoint: { x: 100, y: 100 },
    });
    const e2 = edge({
      ghost: true,
      fromPoint: { x: 100, y: 0 },
      toPoint: { x: 100, y: 100 },
    });
    markParallelBundles([e1, e2]);
    expect(e1.fromPoint.x).toBeCloseTo(106);
    expect(e1.toPoint.x).toBeCloseTo(106);
    expect(e2.fromPoint.x).toBeCloseTo(94);
    expect(e2.toPoint.x).toBeCloseTo(94);
    expect(e1.fromPoint.y).toBeCloseTo(0);
    expect(e2.toPoint.y).toBeCloseTo(100);
  });

  it("nudges cyclic edges perpendicular as well", () => {
    const e1 = edge({
      cyclic: true,
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 100, y: 0 },
    });
    const e2 = edge({
      cyclic: true,
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 100, y: 0 },
    });
    markParallelBundles([e1, e2]);
    // Horizontal edge → perpendicular is y-axis.
    expect(e1.fromPoint.y).not.toBe(e2.fromPoint.y);
    expect(Math.abs(e1.fromPoint.y - e2.fromPoint.y)).toBeCloseTo(12);
  });

  it("handles N=3 with symmetric offsets", () => {
    const e1 = edge({ ghost: true, fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    const e2 = edge({ ghost: true, fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    const e3 = edge({ ghost: true, fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 100 } });
    markParallelBundles([e1, e2, e3]);
    // For a downward edge, perp is (-1, 0); offset multipliers are -1, 0, +1.
    // e1 ends up at x = -1 * (-12) = +12, e3 at -1 * (+12) = -12.
    expect(e1.fromPoint.x).toBeCloseTo(12);
    expect(e2.fromPoint.x).toBeCloseTo(0);
    expect(e3.fromPoint.x).toBeCloseTo(-12);
    expect(e1.bundleIndex).toBe(0);
    expect(e2.bundleIndex).toBe(1);
    expect(e3.bundleIndex).toBe(2);
  });

  it("does not nudge zero-length ghost edges (avoids NaN)", () => {
    const e1 = edge({ ghost: true, fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } });
    const e2 = edge({ ghost: true, fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } });
    markParallelBundles([e1, e2]);
    expect(e1.fromPoint).toEqual({ x: 0, y: 0 });
    expect(e2.toPoint).toEqual({ x: 0, y: 0 });
    expect(e1.bundleSize).toBe(2);
  });
});
