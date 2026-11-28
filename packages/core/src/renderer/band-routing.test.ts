/**
 * The band phase's helpers (#3881), driven directly on hand-placed routes.
 */
import { describe, it, expect } from "vitest";
import { clearHeldPorts } from "./band-routing.js";
import { distributeChannelLanes, LANE_PITCH, NO_CHANNEL_LIMITS } from "./edge-routing-lanes.js";
import { BAND_PHASE } from "./band-routing.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

const card = (id: string, x: number, y: number, width = 200, height = 60) =>
  ({ id, x, y, width, height, ghost: false }) as LayoutNode;

describe("clearHeldPorts (#3881)", () => {
  it("leaves a band route as it was, square, when every move is refused", () => {
    // A held port in the middle of the bottom side leaves two free stretches.
    const nodes = new Map([["A", card("A", 0, 0)]]);
    const held = {
      from: "A",
      to: "X",
      fromPoint: { x: 100, y: 60 },
      toPoint: { x: 100, y: 200 },
    } as LayoutEdge;
    const band = {
      from: "A",
      to: "G",
      fromPoint: { x: 100, y: 60 },
      waypoints: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
      toPoint: { x: 300, y: 200 },
      ghost: true,
      band: true,
    } as LayoutEdge;
    clearHeldPorts(nodes, [band], [held], () => false);
    expect([band.fromPoint, ...band.waypoints!]).toEqual([
      { x: 100, y: 60 },
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]);
  });
});

describe("distributeChannelLanes in the band phase (#3881)", () => {
  it("gives each band run its own free y, even where two share a lane index", () => {
    const nodes = new Map([
      ["T", card("T", 0, 0, 400, 60)],
      ["B", card("B", 0, 200, 400, 60)],
    ]);
    const runAt = (from: string, x0: number, x1: number, y: number, band: boolean) =>
      ({
        from,
        to: "B",
        fromPoint: { x: x0, y: 60 },
        waypoints: [
          { x: x0, y },
          { x: x1, y },
        ],
        toPoint: { x: x1, y: 200 },
        ...(band ? { ghost: true, band: true } : {}),
      }) as LayoutEdge;
    const h1 = runAt("T", 10, 90, 137, false);
    const h2 = runAt("T", 310, 390, 123, false);
    const a = runAt("T", 20, 80, 130, true);
    const b = runAt("T", 320, 380, 130, true);
    distributeChannelLanes(nodes, [h1, h2, a, b], [], NO_CHANNEL_LIMITS, BAND_PHASE);
    const y = (e: LayoutEdge) => e.waypoints![0].y;
    expect(Math.abs(y(a) - y(h1))).toBeGreaterThanOrEqual(LANE_PITCH);
    expect(Math.abs(y(b) - y(h2))).toBeGreaterThanOrEqual(LANE_PITCH);
    expect(y(h1)).toBe(137);
    expect(y(h2)).toBe(123);
  });
});
