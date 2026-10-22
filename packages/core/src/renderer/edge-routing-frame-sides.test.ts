/**
 * The gutters of a drill-down are measured inside its frame (#3154). A ghost
 * card placed beside the frame (a user on the left, a caller system on the
 * right) used to set the basis every gutter lane is counted from, so even the
 * first lane ran past the frame's side, outside the ghost card.
 *
 * The basis is `contentBounds`, which all four gutter passes share (TPL-219),
 * so it is pinned here on hand-placed cards. The frame's widening for the
 * second lane on is fenced on laid-out models in `routing-parity.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { contentBounds } from "./edge-routing-groups.js";
import { channelLimitsOf, NO_CHANNEL_LIMITS } from "./edge-routing-lanes.js";
import type { LayoutNode } from "./layout-types.js";

function card(id: string, x: number, y: number, ghost = false): LayoutNode {
  return {
    kind: "domain",
    id,
    label: id,
    properties: {},
    linkCount: 0,
    hasChildren: false,
    hasDescription: false,
    x,
    y,
    width: 100,
    height: 60,
    ghost,
  } as LayoutNode;
}

/** A drill-down frame around two cards, with the padding `layoutInner` leaves. */
const FRAME = { x: -40, y: -80, width: 300, height: 220 };
const INSIDE = [card("A", 0, 0), card("B", 120, 0)];
const GHOSTS = [card("UserGhost", -300, 0, true), card("CallerGhost", 400, 0, true)];

describe("drill-down gutters are measured inside the frame (#3154, TPL-3132)", () => {
  it("a ghost card beside the frame does not set the gutter basis", () => {
    expect(contentBounds([...INSIDE, ...GHOSTS], [], channelLimitsOf(FRAME))).toEqual({
      minLeft: 0,
      maxRight: 220,
    });
  });

  it("without a frame every card counts, as before", () => {
    expect(contentBounds([...INSIDE, ...GHOSTS], [], NO_CHANNEL_LIMITS)).toEqual({
      minLeft: -300,
      maxRight: 500,
    });
  });
});
