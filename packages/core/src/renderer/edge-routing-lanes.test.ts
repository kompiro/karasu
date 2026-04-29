import { describe, it, expect } from "vitest";
import { distributeChannelLanes } from "./edge-routing-lanes.js";
import type { LayoutEdge } from "./layout.js";

function edge(
  from: string,
  to: string,
  channelY: number,
  leftX: number,
  rightX: number,
): LayoutEdge {
  return {
    from,
    to,
    fromPoint: { x: leftX, y: 0 },
    toPoint: { x: rightX, y: 1000 },
    waypoints: [
      { x: leftX, y: channelY },
      { x: rightX, y: channelY },
    ],
  };
}

describe("distributeChannelLanes", () => {
  it("leaves a single edge in its channel untouched", () => {
    const edges = [edge("a", "b", 200, 50, 250)];
    distributeChannelLanes(edges);
    expect(edges[0].waypoints![0].y).toBe(200);
    expect(edges[0].waypoints![1].y).toBe(200);
  });

  it("staggers two edges sharing the same channel into distinct lanes", () => {
    const edges = [edge("a", "b", 200, 0, 100), edge("c", "d", 200, 50, 200)];
    distributeChannelLanes(edges);
    const yA = edges[0].waypoints![0].y;
    const yB = edges[1].waypoints![0].y;
    expect(yA).not.toBe(yB);
    // Both waypoints of each edge share the lane y.
    expect(edges[0].waypoints![0].y).toBe(edges[0].waypoints![1].y);
    expect(edges[1].waypoints![0].y).toBe(edges[1].waypoints![1].y);
    // Lanes are within the band centred on 200.
    expect(Math.abs(yA - 200)).toBeLessThanOrEqual(9);
    expect(Math.abs(yB - 200)).toBeLessThanOrEqual(9);
  });

  it("orders lanes by leftX ascending", () => {
    // Three edges, varying left x; the leftmost edge should land on the
    // top-most lane (smallest y).
    const edges = [
      edge("c", "d", 100, 200, 400), // left=200
      edge("a", "b", 100, 0, 50), // left=0 — should land in the top lane
      edge("e", "f", 100, 100, 300), // left=100
    ];
    distributeChannelLanes(edges);
    const yA = edges.find((e) => e.from === "a")!.waypoints![0].y;
    const yE = edges.find((e) => e.from === "e")!.waypoints![0].y;
    const yC = edges.find((e) => e.from === "c")!.waypoints![0].y;
    expect(yA).toBeLessThan(yE);
    expect(yE).toBeLessThan(yC);
  });

  it("does not touch edges with no waypoints", () => {
    const e: LayoutEdge = {
      from: "a",
      to: "b",
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 100, y: 100 },
    };
    distributeChannelLanes([e]);
    expect(e.waypoints).toBeUndefined();
  });

  it("does not touch edges whose two waypoints have differing y", () => {
    // Atypical waypoint shape (not a flat L-shape) — leave it alone.
    const e: LayoutEdge = {
      from: "a",
      to: "b",
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 100, y: 100 },
      waypoints: [
        { x: 0, y: 50 },
        { x: 100, y: 80 },
      ],
    };
    distributeChannelLanes([e]);
    expect(e.waypoints![0].y).toBe(50);
    expect(e.waypoints![1].y).toBe(80);
  });
});
