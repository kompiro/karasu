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

  it("does not move regular edge ports — leaves geometry to distributePorts", () => {
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

  // An edge between two services expanded in place has an `ExpandedFrame` as
  // its endpoint, not a layout node, so `distributePorts` drops it the same
  // way it skips ghost/cyclic edges — and the bundle arrives here still
  // stacked. The nudge keys on that geometry, not on the edge's category
  // (#2477).
  it("nudges a stacked bundle of regular edges", () => {
    const sync = edge({ kind: "sync", fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    const async = edge({ kind: "async", fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    markParallelBundles([sync, async]);
    expect(sync.fromPoint.x).not.toBe(async.fromPoint.x);
    expect(Math.abs(sync.fromPoint.x - async.fromPoint.x)).toBe(12);
    // Only the perpendicular axis moves.
    expect(sync.fromPoint.y).toBe(0);
    expect(async.toPoint.y).toBe(100);
  });

  it("leaves a stacked bundle alone when the edges carry their own route", () => {
    const routed = { waypoints: [{ x: 40, y: 50 }] };
    const e1 = edge({ ...routed, fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    const e2 = edge({ ...routed, fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    markParallelBundles([e1, e2]);
    // Nudging endpoints under a waypointed edge would tear the line off its
    // own polyline, so the bundle keeps its geometry and only labels slide.
    expect(e1.fromPoint).toEqual({ x: 100, y: 0 });
    expect(e2.fromPoint).toEqual({ x: 100, y: 0 });
    expect(e1.bundleSize).toBe(2);
  });

  it("leaves a stacked bundle alone when the edges ride an aggregation trunk", () => {
    const e1 = edge({ trunkId: "S2", fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    const e2 = edge({ trunkId: "S2", fromPoint: { x: 100, y: 0 }, toPoint: { x: 100, y: 100 } });
    markParallelBundles([e1, e2]);
    expect(e1.fromPoint).toEqual({ x: 100, y: 0 });
    expect(e2.fromPoint).toEqual({ x: 100, y: 0 });
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
