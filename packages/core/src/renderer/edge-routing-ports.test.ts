import { describe, it, expect } from "vitest";
import { distributePorts } from "./edge-routing-ports.js";
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

describe("distributePorts", () => {
  it("leaves a single edge at its original position", () => {
    const nodes = new Map<string, LayoutNode>([
      ["a", node("a", 0, 0)],
      ["b", node("b", 0, 200)],
    ]);
    const edges: LayoutEdge[] = [
      { from: "a", to: "b", fromPoint: { x: 50, y: 60 }, toPoint: { x: 50, y: 200 } },
    ];
    distributePorts(nodes, edges);
    expect(edges[0].fromPoint.x).toBe(50);
    expect(edges[0].toPoint.x).toBe(50);
  });

  it("spreads N edges across the bottom side at i/(N+1)", () => {
    // Hub at x=100..300 (width 200), three downward edges.
    const nodes = new Map<string, LayoutNode>([
      ["hub", node("hub", 100, 0, 200, 60)],
      ["a", node("a", 0, 200)],
      ["b", node("b", 200, 200)],
      ["c", node("c", 400, 200)],
    ]);
    const edges: LayoutEdge[] = [
      // Initial fromPoint is bottom-center (200, 60); update via distribute.
      { from: "hub", to: "a", fromPoint: { x: 200, y: 60 }, toPoint: { x: 50, y: 200 } },
      { from: "hub", to: "b", fromPoint: { x: 200, y: 60 }, toPoint: { x: 250, y: 200 } },
      { from: "hub", to: "c", fromPoint: { x: 200, y: 60 }, toPoint: { x: 450, y: 200 } },
    ];
    distributePorts(nodes, edges);
    // Sorted by target x ascending: a (50), b (250), c (450).
    // Ports at 1/4, 2/4, 3/4 of [100..300] = 150, 200, 250.
    expect(edges[0].fromPoint.x).toBe(150);
    expect(edges[1].fromPoint.x).toBe(200);
    expect(edges[2].fromPoint.x).toBe(250);
    // y stays on the side (bottom = 60).
    expect(edges[0].fromPoint.y).toBe(60);
  });

  it("does not cross edges at the node side", () => {
    // Targets in shuffled input order; sorted by x they become a, b.
    // We expect leftmost source port → leftmost target.
    const nodes = new Map<string, LayoutNode>([
      ["hub", node("hub", 0, 0, 100, 60)],
      ["a", node("a", 0, 200)], // target x = 50
      ["b", node("b", 200, 200)], // target x = 250
    ]);
    const edges: LayoutEdge[] = [
      // Input order: edge to b first, edge to a second.
      { from: "hub", to: "b", fromPoint: { x: 50, y: 60 }, toPoint: { x: 250, y: 200 } },
      { from: "hub", to: "a", fromPoint: { x: 50, y: 60 }, toPoint: { x: 50, y: 200 } },
    ];
    distributePorts(nodes, edges);
    // Edge to a (leftmost target) should get the leftmost port.
    const eA = edges.find((e) => e.to === "a")!;
    const eB = edges.find((e) => e.to === "b")!;
    expect(eA.fromPoint.x).toBeLessThan(eB.fromPoint.x);
  });

  it("distributes across left/right sides by opposite endpoint y", () => {
    // Same-row scenario: hub on right, two siblings on left at different y.
    const nodes = new Map<string, LayoutNode>([
      ["hub", node("hub", 200, 100, 80, 200)], // x=200..280, y=100..300
      ["a", node("a", 0, 80)], // sibling above
      ["b", node("b", 0, 220)], // sibling below
    ]);
    const edges: LayoutEdge[] = [
      // Both attach to hub's left side; before distribution at midpoint.
      { from: "a", to: "hub", fromPoint: { x: 100, y: 110 }, toPoint: { x: 200, y: 200 } },
      { from: "b", to: "hub", fromPoint: { x: 100, y: 250 }, toPoint: { x: 200, y: 200 } },
    ];
    distributePorts(nodes, edges);
    // Sorted by source y ascending: a (110), b (250).
    // Ports along left side y at 1/3 and 2/3 of [100..300] → 166.67 and 233.33.
    const eA = edges.find((e) => e.from === "a")!;
    const eB = edges.find((e) => e.from === "b")!;
    expect(eA.toPoint.x).toBe(200); // stays on left edge
    expect(eA.toPoint.y).toBeCloseTo(166.67, 1);
    expect(eB.toPoint.y).toBeCloseTo(233.33, 1);
  });

  it("skips ghost and cyclic edges", () => {
    const nodes = new Map<string, LayoutNode>([
      ["hub", node("hub", 0, 0, 100, 60)],
      ["a", node("a", 0, 200)],
      ["b", node("b", 200, 200)],
    ]);
    const edges: LayoutEdge[] = [
      {
        from: "hub",
        to: "a",
        fromPoint: { x: 50, y: 60 },
        toPoint: { x: 50, y: 200 },
        ghost: true,
      },
      {
        from: "hub",
        to: "b",
        fromPoint: { x: 50, y: 60 },
        toPoint: { x: 250, y: 200 },
        cyclic: true,
      },
    ];
    distributePorts(nodes, edges);
    // Ghost / cyclic are excluded → both stay at the original midpoint.
    expect(edges[0].fromPoint.x).toBe(50);
    expect(edges[1].fromPoint.x).toBe(50);
  });

  it("does not touch endpoints not anchored on a node side", () => {
    // Endpoint sits in the middle of the node, not on any side.
    const nodes = new Map<string, LayoutNode>([
      ["hub", node("hub", 0, 0, 100, 60)],
      ["a", node("a", 0, 200)],
      ["b", node("b", 200, 200)],
    ]);
    const edges: LayoutEdge[] = [
      { from: "hub", to: "a", fromPoint: { x: 50, y: 30 }, toPoint: { x: 50, y: 200 } }, // fromPoint inside hub
      { from: "hub", to: "b", fromPoint: { x: 50, y: 30 }, toPoint: { x: 250, y: 200 } },
    ];
    distributePorts(nodes, edges);
    // Both fromPoints unrecognised → no distribution.
    expect(edges[0].fromPoint.x).toBe(50);
    expect(edges[1].fromPoint.x).toBe(50);
  });
});
