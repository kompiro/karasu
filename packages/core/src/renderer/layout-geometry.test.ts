import { describe, it, expect } from "vitest";
import { normalizeCoordinates, translateEdgePoints } from "./layout-geometry.js";
import { CONTAINER_PADDING } from "./layout-constants.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

const node = (id: string, x: number, y: number): LayoutNode =>
  ({ id, x, y, width: 100, height: 50 }) as LayoutNode;

/** Two trunk siblings sharing one entry object, the way `aggregateGroupTrunks` builds them. */
function trunkSiblings(): { edges: LayoutEdge[]; entry: { x: number; y: number } } {
  const entry = { x: 300, y: 200 };
  const edges = [
    { from: "A", to: "T", fromPoint: { x: 100, y: 0 }, toPoint: entry, waypoints: [] },
    { from: "B", to: "T", fromPoint: { x: 100, y: 100 }, toPoint: entry, waypoints: [] },
  ] as LayoutEdge[];
  return { edges, entry };
}

describe("translateEdgePoints (#2966)", () => {
  it("moves a point shared by several edges once", () => {
    const { edges, entry } = trunkSiblings();
    translateEdgePoints(edges, 10, 20);
    expect(entry).toEqual({ x: 310, y: 220 });
    expect(edges[0].toPoint).toBe(edges[1].toPoint);
    expect(edges[0].fromPoint).toEqual({ x: 110, y: 20 });
  });
});

describe("normalizeCoordinates (#2966)", () => {
  it("shifts a shared trunk end once on both axes", () => {
    // A waypoint left of and above every node forces a shift on x and y.
    const { edges, entry } = trunkSiblings();
    edges[0].waypoints = [{ x: -40, y: -30 }];
    const nodes = new Map([["T", node("T", 200, 175)]]);
    normalizeCoordinates([], nodes, edges);
    const shiftX = CONTAINER_PADDING + 40;
    const shiftY = CONTAINER_PADDING + 30;
    expect(entry).toEqual({ x: 300 + shiftX, y: 200 + shiftY });
    // The entry stays on the target's right side, where the trunk put it.
    const t = nodes.get("T")!;
    expect(entry.x).toBe(t.x + t.width);
  });
});
