import { describe, it, expect } from "vitest";
import {
  channelRunsOf,
  collectChannels,
  distributeChannelLanes,
  LANE_PITCH,
} from "./edge-routing-lanes.js";
import type { LayoutEdge, LayoutNode } from "./layout.js";

const NO_NODES = new Map<string, LayoutNode>();

/** The interior L `routeOrthogonalEdges` produces: drop, run along `channelY`, drop. */
function lEdge(
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

/** An arbitrary orthogonal polyline: first point is the source port, last the target port. */
function polyline(from: string, to: string, pts: { x: number; y: number }[]): LayoutEdge {
  return { from, to, fromPoint: pts[0], toPoint: pts[pts.length - 1], waypoints: pts.slice(1, -1) };
}

function card(id: string, x: number, y: number, width: number, height: number): LayoutNode {
  return { id, x, y, width, height } as LayoutNode;
}

const runYs = (e: LayoutEdge) => e.waypoints!.map((w) => w.y);

/**
 * Full-width cards stacked as rows, so each gap between them is one channel.
 * Without any obstacle every run on the canvas shares a single unbounded band.
 */
function rowsAt(...tops: number[]): Map<string, LayoutNode> {
  return new Map(tops.map((y, i) => [`row${i}`, card(`row${i}`, 0, y, 1000, 60)]));
}

describe("channelRunsOf", () => {
  it("finds nothing on a straight edge or a pure vertical corridor", () => {
    expect(
      channelRunsOf(
        polyline("a", "b", [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ]),
      ),
    ).toEqual([]);
    // A 2-waypoint gutter route: side stub → vertical corridor → side stub.
    const gutter = polyline("a", "b", [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 400 },
      { x: 100, y: 400 },
    ]);
    expect(channelRunsOf(gutter)).toEqual([]);
  });

  it("does not count a segment that ends on a port", () => {
    // Mixed route: channel stub out of the source, corridor, side stub into
    // the target. The last horizontal ends on `toPoint`, so moving it would
    // tear the edge off its node — that separation is the port passes' job.
    const mixed = polyline("a", "b", [
      { x: 100, y: 100 },
      { x: 100, y: 130 },
      { x: 900, y: 130 },
      { x: 900, y: 500 },
      { x: 600, y: 500 },
    ]);
    const runs = channelRunsOf(mixed);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ i: 0, y: 130, leftX: 100, rightX: 900 });
  });
});

describe("distributeChannelLanes", () => {
  it("leaves a single edge in its channel untouched", () => {
    const edges = [lEdge("a", "b", 200, 50, 250)];
    distributeChannelLanes(NO_NODES, edges);
    expect(runYs(edges[0])).toEqual([200, 200]);
  });

  it("staggers two edges sharing the same channel into lanes one pitch apart", () => {
    const edges = [lEdge("a", "b", 200, 0, 100), lEdge("c", "d", 200, 50, 200)];
    distributeChannelLanes(NO_NODES, edges);
    const yA = edges[0].waypoints![0].y;
    const yB = edges[1].waypoints![0].y;
    expect(yB - yA).toBe(LANE_PITCH);
    // Both waypoints of each run share the lane y, and the pair is centred on
    // the channel.
    expect(runYs(edges[0])).toEqual([yA, yA]);
    expect(runYs(edges[1])).toEqual([yB, yB]);
    expect((yA + yB) / 2).toBe(200);
  });

  it("lets runs with disjoint x-ranges share a lane, and hands out lanes left to right", () => {
    // `a` (0..50) and `e` (100..300) never draw over each other, so they take
    // the same lane; `c` (200..400) overlaps `e` and gets the next one. Two
    // lanes, not three — which is also what the placement reserves room for.
    const edges = [
      lEdge("c", "d", 100, 200, 400),
      lEdge("a", "b", 100, 0, 50),
      lEdge("e", "f", 100, 100, 300),
    ];
    expect(collectChannels(NO_NODES, edges)[0].lanes).toBe(2);
    distributeChannelLanes(NO_NODES, edges);
    const yA = edges.find((e) => e.from === "a")!.waypoints![0].y;
    const yE = edges.find((e) => e.from === "e")!.waypoints![0].y;
    const yC = edges.find((e) => e.from === "c")!.waypoints![0].y;
    expect(yA).toBe(yE);
    expect(yC - yE).toBe(LANE_PITCH);
  });

  it("does not let two runs share a lane when their ends would meet", () => {
    // 0..200 and 205..400 are disjoint but their verticals would sit 5px
    // apart, reading as one bent edge. They take separate lanes.
    const edges = [lEdge("a", "b", 100, 0, 200), lEdge("c", "d", 100, 205, 400)];
    expect(collectChannels(NO_NODES, edges)[0].lanes).toBe(2);
  });

  it("keeps the pitch independent of how many edges share the channel (#2608)", () => {
    // The old pass split an 18px band N + 1 ways: 31 edges came out 0.56px
    // apart. Here adjacent lanes stay exactly one pitch apart at any N.
    for (const n of [2, 5, 31]) {
      const edges = Array.from({ length: n }, (_e, i) =>
        lEdge(`s${i}`, `t${i}`, 300, i * 10, 2000),
      );
      distributeChannelLanes(NO_NODES, edges);
      const ys = edges.map((e) => e.waypoints![0].y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(LANE_PITCH, 9);
    }
  });

  it("enrols a mixed route's channel run alongside the interior L (TPL-1954)", () => {
    // Four waypoints: channel stub out of the source, gutter corridor, channel
    // stub into the target. Its first run shares the channel at y=130 with a
    // plain L; the old pass only looked at 2-waypoint routes and left them
    // collinear.
    const mixed = polyline("m", "n", [
      { x: 100, y: 100 },
      { x: 100, y: 130 },
      { x: 900, y: 130 },
      { x: 900, y: 500 },
      { x: 400, y: 500 },
      { x: 400, y: 600 },
    ]);
    const plain = lEdge("a", "b", 130, 300, 700);
    // Rows at 40..100 / 160..220 / 440..500: the runs at 130 and 500 sit in
    // different channels.
    distributeChannelLanes(rowsAt(40, 160, 440), [mixed, plain]);
    expect(mixed.waypoints![0].y).not.toBe(plain.waypoints![0].y);
    expect(Math.abs(mixed.waypoints![0].y - plain.waypoints![0].y)).toBe(LANE_PITCH);
    // The mixed route's other run (y=500) had the channel to itself.
    expect(mixed.waypoints![2].y).toBe(500);
    expect(mixed.waypoints![3].y).toBe(500);
  });

  it("enrols a route shape the chain does not produce today (TPL-1954)", () => {
    // Ten bends — three channel runs — which no pass in the chain emits. It
    // takes part without being registered anywhere: the run at y=130 is
    // separated from the L that shares that channel, and the two other runs,
    // alone in their channels, stay put.
    const zigzag = polyline("z", "w", [
      { x: 50, y: 100 },
      { x: 50, y: 130 },
      { x: 500, y: 130 },
      { x: 500, y: 260 },
      { x: 150, y: 260 },
      { x: 150, y: 390 },
      { x: 700, y: 390 },
      { x: 700, y: 520 },
      { x: 400, y: 520 },
      { x: 400, y: 600 },
    ]);
    const plain = lEdge("a", "b", 130, 300, 800);
    distributeChannelLanes(rowsAt(40, 160, 300, 430, 560), [zigzag, plain]);
    expect(Math.abs(zigzag.waypoints![0].y - plain.waypoints![0].y)).toBe(LANE_PITCH);
    expect(zigzag.waypoints![1].y).toBe(zigzag.waypoints![0].y);
    expect(runYs(zigzag).slice(2)).toEqual([260, 260, 390, 390, 520, 520]);
  });

  it("keys the channel on the band between rows, not on an exact y", () => {
    // Two runs a few pixels apart inside the same gap are one channel's
    // traffic and are lane-separated together, centred on the gap.
    const rows = new Map([
      ["r1", card("r1", 0, 0, 1000, 100)],
      ["r2", card("r2", 0, 200, 1000, 100)],
    ]);
    const edges = [lEdge("a", "b", 148, 100, 400), lEdge("c", "d", 152, 300, 700)];
    expect(collectChannels(rows, edges)).toHaveLength(1);
    distributeChannelLanes(rows, edges);
    expect(runYs(edges[0])).toEqual([150 - LANE_PITCH / 2, 150 - LANE_PITCH / 2]);
    expect(runYs(edges[1])).toEqual([150 + LANE_PITCH / 2, 150 + LANE_PITCH / 2]);
  });

  it("bounds a channel by frames as well as cards", () => {
    // A frame whose bottom sits 20px below the row's cards narrows the band;
    // the lanes centre on the band between the frame and the next row.
    const rows = new Map([
      ["r1", card("r1", 0, 0, 1000, 100)],
      ["r2", card("r2", 0, 300, 1000, 100)],
    ]);
    const frame = { x: -20, y: -20, width: 1040, height: 140 }; // bottom = 120
    const edges = [lEdge("a", "b", 210, 100, 400), lEdge("c", "d", 210, 300, 700)];
    distributeChannelLanes(rows, edges, [frame]);
    const ys = edges.map((e) => e.waypoints![0].y).sort((a, b) => a - b);
    expect((ys[0] + ys[1]) / 2).toBe((120 + 300) / 2);
  });

  it("compresses into the band, never into the rows, when nothing reserved room", () => {
    // Five runs at LANE_PITCH need 70px; this gap has 40. Without a
    // reservation (the multi-system root) the lanes shrink to fit rather than
    // spill into the cards above and below — a penetration is worse than an
    // overlap (TPL-1927), and this is the documented fallback only.
    const rows = new Map([
      ["r1", card("r1", 0, 0, 1000, 100)],
      ["r2", card("r2", 0, 140, 1000, 100)],
    ]);
    const edges = Array.from({ length: 5 }, (_e, i) => lEdge(`s${i}`, `t${i}`, 120, i * 10, 900));
    distributeChannelLanes(rows, edges);
    const ys = edges.map((e) => e.waypoints![0].y).sort((a, b) => a - b);
    expect(ys[0]).toBeGreaterThan(100);
    expect(ys[ys.length - 1]).toBeLessThan(140);
    expect(new Set(ys).size).toBe(5);
  });

  it("is deterministic", () => {
    const make = () => [
      lEdge("c", "d", 100, 200, 400),
      lEdge("a", "b", 100, 0, 50),
      lEdge("e", "f", 100, 100, 300),
    ];
    const first = make();
    const second = make();
    distributeChannelLanes(NO_NODES, first);
    distributeChannelLanes(NO_NODES, second);
    expect(first.map(runYs)).toEqual(second.map(runYs));
  });
});
