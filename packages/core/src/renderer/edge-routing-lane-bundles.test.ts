/**
 * Lane bundles (#2958): gutter corridors that share an end take one lane.
 *
 * These drive `distributeGutterLanes` directly on hand-placed routes, so each
 * rule of the bundle is pinned on its own: which corridors bundle, which never
 * do, and what the siblings carry for the passes after it. The whole-chain
 * behaviour (shared geometry surviving to the end, TPL-2958) is fenced on a
 * saturated model in `routing-parity.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { distributeGutterLanes, TRUNK_LANE_GAP } from "./edge-routing-groups.js";
import { collectChannels } from "./edge-routing-lanes.js";
import { detectMarks } from "./crossing-marks.js";
import { ownLabelSegment } from "./edge-routing.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

/** The right gutter's base lane: `maxRight + GUTTER_GAP`. */
const GUTTER_GAP = 28;

function node(id: string, x: number, y: number): LayoutNode {
  return {
    kind: "service",
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
  } as LayoutNode;
}

/**
 * Three sources stacked in one column and two targets below them, all ending
 * at x = 100, so every corridor beyond 128 is in the right gutter.
 */
const NODES = new Map<string, LayoutNode>(
  [node("A", 0, 0), node("B", 0, 100), node("C", 0, 200), node("T", 0, 400), node("U", 0, 500)].map(
    (n) => [n.id, n],
  ),
);
const RIGHT = 100;
const BASE = RIGHT + GUTTER_GAP;

/** A plain gutter route out of `from`'s right side and into `to`'s. */
function plain(from: string, to: string, kind?: "sync" | "async"): LayoutEdge {
  const f = NODES.get(from)!;
  const t = NODES.get(to)!;
  const fy = f.y + 30;
  const ty = t.y + 30;
  return {
    from,
    to,
    kind,
    fromPoint: { x: RIGHT, y: fy },
    toPoint: { x: RIGHT, y: ty },
    waypoints: [
      { x: BASE, y: fy },
      { x: BASE, y: ty },
    ],
  };
}

/**
 * A mixed route (#1954): it leaves `from` through the bottom, runs along the
 * channel below it out to the gutter, then enters `to` from the right like a
 * plain route. Its corridor is waypoints 1-2, not 0-1.
 */
function mixed(from: string, to: string): LayoutEdge {
  const f = NODES.get(from)!;
  const t = NODES.get(to)!;
  const channelY = f.y + f.height + 20;
  const ty = t.y + 30;
  return {
    from,
    to,
    fromPoint: { x: 50, y: f.y + f.height },
    toPoint: { x: RIGHT, y: ty },
    waypoints: [
      { x: 50, y: channelY },
      { x: BASE, y: channelY },
      { x: BASE, y: ty },
    ],
  };
}

const spineX = (e: LayoutEdge, i: number) => e.waypoints![i].x;

describe("lane bundles (#2958)", () => {
  it("puts corridors entering one target the same way on one lane", () => {
    const edges = [plain("A", "T"), plain("B", "T"), plain("C", "U")];
    edges[0].groupBackward = true;
    distributeGutterLanes(NODES, edges, []);
    const [a, b, c] = edges;
    expect(spineX(a, 0)).toBe(spineX(b, 0));
    expect(a.trunkId).toBeDefined();
    expect(a.trunkId).toBe(b.trunkId);
    // Not the trunk passes' id (the target id): `fanOutGutterPorts` merges by
    // id, so a node with two bundles needs two.
    expect(a.trunkId).not.toBe("T");
    expect([a.trunkJoin, b.trunkJoin]).toEqual([0, 0]);
    // A dash on one sibling would stripe a spine the others draw solid.
    expect(a.groupBackward).toBe(false);
    // The lone corridor gets a lane of its own and no tag.
    expect(spineX(c, 0)).not.toBe(spineX(a, 0));
    expect(c.trunkId).toBeUndefined();
    expect(c.outTrunkId).toBeUndefined();
  });

  it("bundles a mixed route with a plain one by the part they share", () => {
    const edges = [plain("A", "T"), mixed("B", "T")];
    distributeGutterLanes(NODES, edges, []);
    const [a, b] = edges;
    expect(a.trunkId).toBeDefined();
    expect(a.trunkId).toBe(b.trunkId);
    expect(spineX(a, 0)).toBe(spineX(b, 1));
    // Each sibling joins the spine at its own corridor's start.
    expect([a.trunkJoin, b.trunkJoin]).toEqual([0, 1]);
  });

  it("never bundles a sync edge with an async one (#2490)", () => {
    const edges = [plain("A", "T", "sync"), plain("B", "T", "async")];
    distributeGutterLanes(NODES, edges, []);
    const [a, b] = edges;
    expect(a.trunkId).toBeUndefined();
    expect(b.trunkId).toBeUndefined();
    expect(spineX(a, 0)).not.toBe(spineX(b, 0));
  });

  it("puts corridors leaving one source the same way on one lane", () => {
    const edges = [plain("A", "T"), plain("A", "U")];
    distributeGutterLanes(NODES, edges, []);
    const [t, u] = edges;
    expect(t.trunkId).toBeUndefined();
    expect(t.outTrunkId).toBeDefined();
    expect(t.outTrunkId).toBe(u.outTrunkId);
    expect(spineX(t, 0)).toBe(spineX(u, 0));
    // A fan-out sibling leaves the spine at its corridor's end.
    expect([t.trunkJoin, u.trunkJoin]).toEqual([1, 1]);
  });

  it("lets a shared target claim an edge before a shared source does", () => {
    // A -> T shares its target with B -> T and its source with A -> U.
    const edges = [plain("A", "T"), plain("B", "T"), plain("A", "U")];
    distributeGutterLanes(NODES, edges, []);
    const [at, bt, au] = edges;
    expect(at.trunkId).toBe(bt.trunkId);
    expect(at.outTrunkId).toBeUndefined();
    // Its source partner is left alone, so it forms no fan-out.
    expect(au.outTrunkId).toBeUndefined();
  });

  it("lays out corridors that share no end as it did before #2958", () => {
    const edges = [plain("A", "T"), plain("B", "U")];
    distributeGutterLanes(NODES, edges, []);
    for (const e of edges) {
      expect(e.trunkId).toBeUndefined();
      expect(e.outTrunkId).toBeUndefined();
      expect(e.trunkJoin).toBeUndefined();
    }
    // The two overlap in y, so the second steps out one lane.
    expect(spineX(edges[0], 0)).toBe(BASE);
    expect(spineX(edges[1], 0)).toBe(BASE + TRUNK_LANE_GAP);
  });
});

describe("lane bundles downstream (#2958)", () => {
  it("keeps a bundle's identical channel runs on one lane", () => {
    // Two fan-out siblings leave B through the same channel run.
    const edges = [mixed("B", "T"), mixed("B", "U")];
    distributeGutterLanes(NODES, edges, []);
    expect(edges[0].outTrunkId).toBeDefined();
    const runs = collectChannels(NODES, edges, []).flatMap((c) => c.runs);
    expect(runs).toHaveLength(2);
    expect(runs[0].lane).toBe(runs[1].lane);
  });

  it("separates the same runs when they belong to no bundle", () => {
    const edges = [mixed("B", "T"), mixed("B", "U")];
    const runs = collectChannels(NODES, edges, []).flatMap((c) => c.runs);
    expect(runs[0].lane).not.toBe(runs[1].lane);
  });

  it("marks the merge where each sibling joins the spine, even past a channel elbow", () => {
    const edges = [plain("A", "T"), mixed("B", "T")];
    distributeGutterLanes(NODES, edges, []);
    const { trunks } = detectMarks(edges);
    expect(trunks).toHaveLength(1);
    const ys = trunks[0].entries.map((e) => e.y).sort((p, q) => p - q);
    // A joins at its exit row, B where its channel run meets the spine.
    expect(ys).toEqual([edges[0].waypoints![0].y, edges[1].waypoints![1].y]);
    // The spine turns into T at T's entry row.
    expect(trunks[0].endY).toBe(edges[0].toPoint.y);
  });

  it("labels a sibling on the segment that reaches the spine, not on the spine", () => {
    const edges = [plain("A", "T"), mixed("B", "T"), plain("C", "T"), plain("C", "U")];
    distributeGutterLanes(NODES, edges, []);
    // Fan-in: the segment arriving at the join.
    expect(ownLabelSegment(edges[0])).toBe(0);
    expect(ownLabelSegment(edges[1])).toBe(1);
    // C -> U is a lone corridor here (C -> T went to the fan-in), so it keeps
    // the default anchor.
    expect(ownLabelSegment(edges[3])).toBeUndefined();
  });

  it("labels a fan-out sibling on the segment leaving the spine", () => {
    const edges = [plain("A", "T"), plain("A", "U")];
    distributeGutterLanes(NODES, edges, []);
    // Points: fromPoint, w0, w1, toPoint. The branch is w1 -> toPoint.
    expect(ownLabelSegment(edges[0])).toBe(2);
  });
});
