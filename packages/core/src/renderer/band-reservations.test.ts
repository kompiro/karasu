/**
 * The room a ghost band channel lacks for its lanes (#3881), measured on a
 * routed layout for `layout()`'s second placement.
 */
import { describe, it, expect } from "vitest";
import { bandGapReservations } from "./band-reservations.js";
import { LANE_PITCH } from "./edge-routing-lanes.js";
import type { ContainerRect, LayoutEdge, LayoutNode } from "./layout-types.js";

const frame = (id: string, y: number, height: number, extra: Partial<ContainerRect> = {}) =>
  ({ id, label: id, x: 0, y, width: 400, height, ghost: false, ...extra }) as ContainerRect;
const card = (id: string, y: number, side: "above" | "below") =>
  ({ id, x: 100, y, width: 160, height: 60, ghost: true, ghostBand: side }) as LayoutNode;
const run = (y: number, lo: number, hi: number, band = true) =>
  ({
    from: "a",
    to: "b",
    fromPoint: { x: lo, y: y - 50 },
    waypoints: [
      { x: lo, y },
      { x: hi, y },
    ],
    toPoint: { x: hi, y: y + 50 },
    ghost: band,
    band,
  }) as LayoutEdge;

// The outermost frame, the focus at y 100..300, one band row below at 340.
const containers = [frame("S", 0, 600, { ghost: true }), frame("F", 100, 200)];
const nodes = new Map([["g", card("g", 340, "below")]]);

describe("bandGapReservations (#3881)", () => {
  it("reserves nothing when the channel holds its lanes", () => {
    expect(bandGapReservations({ nodes, edges: [run(320, 0, 200)], containers })).toBeUndefined();
  });

  it("reserves what overlapping runs lack before the first band row", () => {
    const edges = [run(310, 0, 200), run(320, 50, 250), run(330, 100, 300)];
    // Three lanes and a pitch of air need 4 × LANE_PITCH; the gap is 40.
    expect(bandGapReservations({ nodes, edges, containers })).toEqual(
      new Map([["below:0", 4 * LANE_PITCH - 40]]),
    );
  });

  it("does not count runs that share no stretch, or the canvas's own runs", () => {
    const edges = [run(310, 0, 100), run(320, 150, 250), run(330, 0, 300, false)];
    expect(bandGapReservations({ nodes, edges, containers })).toBeUndefined();
  });
});
