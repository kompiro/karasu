import { describe, expect, it } from "vitest";
import {
  attachableSpans,
  BBOX_PORT_FRAME,
  keepOutSpan,
  mapToSpans,
  portPoint,
  subtractSpans,
  type Span,
} from "./port-frame.js";
import { seatPortsOnOutline } from "./port-frame.js";
import type { ShapePortFrame } from "../shapes/shape-registry.js";
import type { LayoutEdge, LayoutNode, Rect } from "./layout-types.js";

const BOX = { x: 100, y: 50, width: 200, height: 100 };

function frameWith(side: keyof ShapePortFrame, spans: Span[], depth = 0): ShapePortFrame {
  return { ...BBOX_PORT_FRAME, [side]: { spans, depth } };
}

describe("keepOutSpan", () => {
  it("projects a rectangle onto the side it touches", () => {
    // A 40px chip at the card's right end covers the last fifth of the top.
    expect(keepOutSpan(BOX, "top", { x: 260, y: 50, width: 40, height: 16 })).toEqual({
      from: 0.8,
      to: 1,
    });
    expect(keepOutSpan(BOX, "left", { x: 100, y: 100, width: 20, height: 50 })).toEqual({
      from: 0.5,
      to: 1,
    });
  });

  it("clamps a rectangle that overhangs the side", () => {
    expect(keepOutSpan(BOX, "top", { x: 60, y: 50, width: 100, height: 16 })).toEqual({
      from: 0,
      to: 0.3,
    });
  });

  it("ignores a rectangle that misses the side", () => {
    expect(keepOutSpan(BOX, "top", { x: 320, y: 50, width: 40, height: 16 })).toBeNull();
  });
});

describe("subtractSpans", () => {
  it("splits a span a cut lands inside", () => {
    expect(subtractSpans([{ from: 0, to: 1 }], [{ from: 0.4, to: 0.6 }])).toEqual([
      { from: 0, to: 0.4 },
      { from: 0.6, to: 1 },
    ]);
  });

  it("trims from the ends and drops a fully covered span", () => {
    expect(subtractSpans([{ from: 0, to: 1 }], [{ from: 0, to: 0.25 }])).toEqual([
      { from: 0.25, to: 1 },
    ]);
    expect(subtractSpans([{ from: 0.2, to: 0.4 }], [{ from: 0, to: 1 }])).toEqual([]);
  });

  it("applies cuts cumulatively", () => {
    expect(
      subtractSpans(
        [{ from: 0, to: 1 }],
        [
          { from: 0.2, to: 0.3 },
          { from: 0.7, to: 0.8 },
        ],
      ),
    ).toEqual([
      { from: 0, to: 0.2 },
      { from: 0.3, to: 0.7 },
      { from: 0.8, to: 1 },
    ]);
  });
});

describe("attachableSpans", () => {
  it("subtracts the keep-outs from what the shape covers", () => {
    const spans = attachableSpans(BOX, "top", BBOX_PORT_FRAME, [
      { x: 260, y: 50, width: 40, height: 16 },
    ]);
    expect(spans).toEqual([{ from: 0, to: 0.8 }]);
  });

  // A port has to exist. An arrowhead under a chip is a blemish; an edge that
  // stops in open space is a lie about what it connects.
  it("keeps the shape's spans when the keep-outs would leave nothing", () => {
    const spans = attachableSpans(BOX, "top", BBOX_PORT_FRAME, [
      { x: 100, y: 50, width: 200, height: 16 },
    ]);
    expect(spans).toEqual([{ from: 0, to: 1 }]);
  });
});

describe("mapToSpans", () => {
  it("is the identity on a whole side", () => {
    expect(mapToSpans([{ from: 0, to: 1 }], 0.25)).toBeCloseTo(0.25, 10);
  });

  it("compresses the whole range into a restricted span", () => {
    const spans = [{ from: 0.2, to: 0.8 }];
    expect(mapToSpans(spans, 0)).toBeCloseTo(0.2, 10);
    expect(mapToSpans(spans, 0.5)).toBeCloseTo(0.5, 10);
    expect(mapToSpans(spans, 1)).toBeCloseTo(0.8, 10);
  });

  it("crosses a gap proportionally instead of piling up at its edge", () => {
    // The medallion case: two halves of a side with a hole in the middle.
    const spans = [
      { from: 0, to: 0.4 },
      { from: 0.6, to: 1 },
    ];
    expect(mapToSpans(spans, 0.25)).toBeCloseTo(0.2, 10);
    expect(mapToSpans(spans, 0.75)).toBeCloseTo(0.8, 10);
    // Nothing lands in the hole.
    for (const t of [0.4, 0.49, 0.5, 0.51, 0.6]) {
      const along = mapToSpans(spans, t);
      expect(along <= 0.4 || along >= 0.6).toBe(true);
    }
  });

  it("keeps the distribution's order and spacing", () => {
    const spans = [
      { from: 0, to: 0.3 },
      { from: 0.7, to: 1 },
    ];
    const mapped = [0.25, 0.5, 0.75].map((t) => mapToSpans(spans, t));
    expect(mapped[0]).toBeLessThan(mapped[1]);
    expect(mapped[1]).toBeLessThan(mapped[2]);
  });
});

describe("portPoint", () => {
  it("places on the bounding box when the shape declares nothing", () => {
    expect(portPoint(BOX, "top", 0.5, BBOX_PORT_FRAME)).toEqual({ x: 200, y: 50 });
    expect(portPoint(BOX, "bottom", 0.5, BBOX_PORT_FRAME)).toEqual({ x: 200, y: 150 });
    expect(portPoint(BOX, "left", 0.5, BBOX_PORT_FRAME)).toEqual({ x: 100, y: 100 });
    expect(portPoint(BOX, "right", 0.5, BBOX_PORT_FRAME)).toEqual({ x: 300, y: 100 });
  });

  it("pushes inward by the side's depth, on the correct normal", () => {
    const framed = frameWith("top", [{ from: 0, to: 1 }], 12);
    expect(portPoint(BOX, "top", 0.5, framed)).toEqual({ x: 200, y: 62 });
    const left = frameWith("left", [{ from: 0, to: 1 }], 12);
    expect(portPoint(BOX, "left", 0.5, left)).toEqual({ x: 112, y: 100 });
    const right = frameWith("right", [{ from: 0, to: 1 }], 12);
    expect(portPoint(BOX, "right", 0.5, right)).toEqual({ x: 288, y: 100 });
  });

  it("evaluates a positional depth at the mapped position, not the raw t", () => {
    // Depth returns the position it was asked about, so the assertion reads it
    // back: t=0.5 maps to 0.7 in this span, and the depth follows.
    const framed: ShapePortFrame = {
      ...BBOX_PORT_FRAME,
      top: { spans: [{ from: 0.6, to: 0.8 }], depth: (along) => along * 100 },
    };
    expect(portPoint(BOX, "top", 0.5, framed).y).toBeCloseTo(50 + 70, 6);
  });

  it("keeps out of a keep-out rectangle", () => {
    const chip = { x: 260, y: 50, width: 40, height: 16 };
    const point = portPoint(BOX, "top", 1, BBOX_PORT_FRAME, [chip]);
    expect(point.x).toBeLessThanOrEqual(chip.x);
  });

  // A chip in the top-right corner was moving the ports on the *bottom* edge
  // as well, because the projection only looked at the x range. Edges that
  // pass nowhere near the chip were sliding sideways for it.
  it("ignores a keep-out that sits against the opposite side", () => {
    const topChip = { x: 260, y: 50, width: 40, height: 16 };
    expect(portPoint(BOX, "bottom", 1, BBOX_PORT_FRAME, [topChip])).toEqual(
      portPoint(BOX, "bottom", 1, BBOX_PORT_FRAME),
    );
    const bottomTab = { x: 260, y: 132, width: 40, height: 18 };
    expect(portPoint(BOX, "top", 1, BBOX_PORT_FRAME, [bottomTab])).toEqual(
      portPoint(BOX, "top", 1, BBOX_PORT_FRAME),
    );
  });
});

describe("seatPortsOnOutline", () => {
  const node = {
    kind: "service",
    id: "N",
    label: "N",
    properties: { links: [] },
    linkCount: 0,
    hasChildren: false,
    hasDescription: false,
    x: 100,
    y: 50,
    width: 200,
    height: 100,
  } as unknown as LayoutNode;
  const nodes = new Map([["N", node]]);

  /** Deep away from the outline, shallow on it — the cloud's hazard, in miniature. */
  const frame: ShapePortFrame = {
    ...BBOX_PORT_FRAME,
    top: { spans: [{ from: 0.4, to: 0.6 }], depth: (along) => (along < 0.4 ? 90 : 10) },
  };
  const resolve = (): { frame: ShapePortFrame; keepOuts: Rect[] } => ({ frame, keepOuts: [] });

  it("seats an endpoint that can reach the span", () => {
    const edge = {
      from: "S",
      to: "N",
      fromPoint: { x: 110, y: 0 },
      toPoint: { x: 110, y: 50 },
    } as unknown as LayoutEdge;
    seatPortsOnOutline(nodes, [edge], resolve, () => []);
    // Moved into the span, and pushed in by the depth that applies there.
    expect(edge.toPoint.x).toBeGreaterThanOrEqual(100 + 200 * 0.4);
    expect(edge.toPoint.y).toBe(60);
  });

  // The depth belongs to the outline. Where the shape says it has no outline,
  // a curve-following function can report a crossing on the far side of the
  // body — 90 here — and bury the endpoint. The bounding box is the honest
  // answer for a port that could not reach a span.
  it("leaves an endpoint that cannot reach one on the bounding box", () => {
    const edge = {
      from: "S",
      to: "N",
      fromPoint: { x: 110, y: 0 },
      toPoint: { x: 110, y: 50 },
    } as unknown as LayoutEdge;
    // An obstacle across the top blocks every sideways move.
    const wall: Rect = { x: 105, y: 30, width: 190, height: 15 };
    seatPortsOnOutline(nodes, [edge], resolve, () => [wall]);
    expect(edge.toPoint.x).toBe(110);
    expect(edge.toPoint.y).toBe(50);
  });
});
