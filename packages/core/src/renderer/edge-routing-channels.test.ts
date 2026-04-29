import { describe, it, expect } from "vitest";
import { routeOrthogonalEdges } from "./edge-routing-channels.js";
import type { LayoutEdge, LayoutNode } from "./layout.js";

function node(id: string, x: number, y: number, w = 100, h = 60): LayoutNode {
  return {
    kind: "service",
    id,
    label: id,
    properties: {} as never,
    linkCount: 0,
    hasChildren: false,
    hasDescription: false,
    x,
    y,
    width: w,
    height: h,
  };
}

function edge(
  from: string,
  to: string,
  fp: { x: number; y: number },
  tp: { x: number; y: number },
): LayoutEdge {
  return { from, to, fromPoint: fp, toPoint: tp };
}

describe("routeOrthogonalEdges", () => {
  it("leaves an unobstructed straight edge alone", () => {
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 0, 0)],
      ["b", node("b", 0, 200)],
    ]);
    const edges: LayoutEdge[] = [edge("a", "b", { x: 50, y: 60 }, { x: 50, y: 200 })];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBeUndefined();
  });

  it("routes a skip-layer edge around an obstructing intermediate node", () => {
    // a (top) at column 200, b (middle, obstacle) at column 200, c (bottom) at column 0.
    // Edge a -> c passes diagonally through b's bounding box.
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 200, 0)],
      ["b", node("b", 150, 100)], // obstacle
      ["c", node("c", 0, 200)],
    ]);
    const edges: LayoutEdge[] = [
      // a's bottom-center → c's top-center
      edge("a", "c", { x: 250, y: 60 }, { x: 50, y: 200 }),
    ];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBeDefined();
    expect(edges[0].waypoints).toHaveLength(2);
    // Both waypoints share the channel y, between the obstacle's bottom (160)
    // and target's top (200).
    expect(edges[0].waypoints![0].y).toBe(edges[0].waypoints![1].y);
    expect(edges[0].waypoints![0].y).toBeGreaterThan(160);
    expect(edges[0].waypoints![0].y).toBeLessThan(200);
    // First waypoint stays in source column; second waypoint stays in target column.
    expect(edges[0].waypoints![0].x).toBe(250);
    expect(edges[0].waypoints![1].x).toBe(50);
  });

  it("skips ghost edges", () => {
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 200, 0)],
      ["b", node("b", 150, 100)],
      ["c", node("c", 0, 200)],
    ]);
    const edges: LayoutEdge[] = [
      { ...edge("a", "c", { x: 250, y: 60 }, { x: 50, y: 200 }), ghost: true },
    ];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBeUndefined();
  });

  it("skips cyclic edges", () => {
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 200, 0)],
      ["b", node("b", 150, 100)],
      ["c", node("c", 0, 200)],
    ]);
    const edges: LayoutEdge[] = [
      { ...edge("a", "c", { x: 250, y: 60 }, { x: 50, y: 200 }), cyclic: true },
    ];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBeUndefined();
  });

  it("falls back to straight line when an L-shape stub would still cross an obstacle", () => {
    // a (top, narrow) and c (bottom) sit nearly column-aligned. b is a
    // wide intermediate node whose interior contains both src.x and to.x.
    // The straight diagonal crosses b; so does each L-shape vertical stub.
    // Routing is unsafe → keep the straight line for Phase 3 to fix.
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 200, 0, 60, 40)],
      ["b", node("b", 100, 100, 200, 40)], // wide; spans both columns
      ["c", node("c", 210, 200, 60, 40)],
    ]);
    const edges: LayoutEdge[] = [edge("a", "c", { x: 230, y: 40 }, { x: 240, y: 200 })];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBeUndefined();
  });

  it("preserves existing waypoints (idempotent)", () => {
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 200, 0)],
      ["b", node("b", 150, 100)],
      ["c", node("c", 0, 200)],
    ]);
    const preset = [{ x: 999, y: 999 }];
    const edges: LayoutEdge[] = [
      { ...edge("a", "c", { x: 250, y: 60 }, { x: 50, y: 200 }), waypoints: preset },
    ];
    routeOrthogonalEdges(nodes, edges);
    expect(edges[0].waypoints).toBe(preset);
  });
});
