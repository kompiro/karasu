import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { countPolylinePenetrations, type Rect, type Point } from "./edge-geometry.js";
import type { LayoutEdge, LayoutNode, LayoutResult } from "./layout-types.js";

// A system with two teams (payments owns Billing/Wallet, catalog owns
// Search/Catalog) plus an un-owned infra store and an [external] service. The
// three Billing→{Catalog,ShopDB,Stripe} edges cross intermediate bands/frames.
const SYS = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }
  database ShopDB { label "Shop DB" }
  service Stripe [external] { label "Stripe" }
  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Catalog "reserve"
  Billing -> ShopDB "persist"
  Billing -> Stripe "authorize"
}
organization Org {
  team "payments" { label "Payments" owns Billing owns Wallet }
  team "catalog" { label "Catalog" owns Search owns Catalog }
}
`;

const OWNER = new Map([
  ["Billing", "payments"],
  ["Wallet", "payments"],
  ["Search", "catalog"],
  ["Catalog", "catalog"],
]);

function layoutOf(krs: string, ownerIndex: Map<string, string>, groupBy?: "team"): LayoutResult {
  const parsed = Parser.parse(krs);
  const slice = extractView(parsed.value.systems, []);
  return layout(slice, { ownerIndex, groupBy });
}

/** The group boundary frames in a layout result. */
function framesOf(res: LayoutResult): (Rect & { id: string })[] {
  return res.containers
    .filter((c) => c.group)
    .map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height }));
}

/** Frame id enclosing a node, or null. Frames are disjoint (P2a). */
function frameOfNode(n: LayoutNode, frames: (Rect & { id: string })[]): string | null {
  for (const f of frames) {
    if (
      n.x >= f.x &&
      n.x + n.width <= f.x + f.width &&
      n.y >= f.y &&
      n.y + n.height <= f.y + f.height
    )
      return f.id;
  }
  return null;
}

/**
 * TPL-20260711-02 dual metric: penetrations of every edge polyline against the
 * obstacles it must never cross (all non-endpoint node cards + all non-endpoint
 * frames). Penetration must be 0.
 */
function totalPenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const fFrom = frameOfNode(res.nodes.get(e.from)!, frames);
    const fTo = frameOfNode(res.nodes.get(e.to)!, frames);
    const obstacles: Rect[] = [
      ...nodes.filter((n) => n.id !== e.from && n.id !== e.to),
      ...frames.filter((f) => f.id !== fFrom && f.id !== fTo),
    ];
    const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    total += countPolylinePenetrations(pts, obstacles);
  }
  return total;
}

/**
 * Penetration count if every edge were drawn straight center-to-center on the
 * grouped node positions — reconstructs the pre-P2c-A defect to prove the
 * fixture exercises the router.
 */
function straightCenterPenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  const center = (n: LayoutNode): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const from = res.nodes.get(e.from)!;
    const to = res.nodes.get(e.to)!;
    const fFrom = frameOfNode(from, frames);
    const fTo = frameOfNode(to, frames);
    const obstacles: Rect[] = [
      ...nodes.filter((n) => n.id !== e.from && n.id !== e.to),
      ...frames.filter((f) => f.id !== fFrom && f.id !== fTo),
    ];
    total += countPolylinePenetrations([center(from), center(to)], obstacles);
  }
  return total;
}

/** Second half of the dual metric: geometric edge-crossing count (observed, not asserted to a fixed value). */
function totalCrossings(res: LayoutResult): number {
  const segs: [Point, Point][] = [];
  for (const e of res.edges) {
    const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  }
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segmentsCross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) n++;
    }
  }
  return n;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c),
    o2 = o(a, b, d),
    o3 = o(c, d, a),
    o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

const edge = (res: LayoutResult, from: string, to: string): LayoutEdge =>
  res.edges.find((e) => e.from === from && e.to === to)!;

describe("routeGroupedEdges (#1859, P2c-A)", () => {
  it("routes so no edge crosses a node or frame interior — penetration == 0 (AC-1, TPL-20260711-02)", () => {
    const grouped = layoutOf(SYS, OWNER, "team");
    // The same grouped node positions with straight center-to-center edges
    // penetrate (this is the defect P2c-A fixes; measured 11). Proving it here
    // guards that the fixture actually exercises the router.
    expect(straightCenterPenetrations(grouped)).toBeGreaterThan(0);
    // Grouped + routed: zero penetrations.
    expect(totalPenetrations(grouped)).toBe(0);
    // Dual metric: crossings are also measured (TPL-20260711-02 — do not judge
    // readability on crossings alone). P2c-A does not minimise them; P2c-C marks
    // them. Just assert the metric is computable and finite.
    expect(Number.isFinite(totalCrossings(grouped))).toBe(true);
  });

  it("leaves clear intra-band edges straight (no gutter detour)", () => {
    const res = layoutOf(SYS, OWNER, "team");
    // Billing→Wallet and Search→Catalog are adjacent within their band; nothing
    // between them, so they keep the plain top/bottom anchors (no waypoints).
    expect(edge(res, "Billing", "Wallet").waypoints ?? []).toHaveLength(0);
    expect(edge(res, "Search", "Catalog").waypoints ?? []).toHaveLength(0);
  });

  it("reroutes cross-band edges through a side gutter (orthogonal waypoints)", () => {
    const res = layoutOf(SYS, OWNER, "team");
    for (const [from, to] of [
      ["Billing", "Catalog"],
      ["Billing", "ShopDB"],
      ["Billing", "Stripe"],
    ] as const) {
      const e = edge(res, from, to);
      expect(e.waypoints).toHaveLength(2);
      // Both waypoints share the gutter x (a vertical corridor), and it sits
      // outside every node card.
      expect(e.waypoints![0].x).toBe(e.waypoints![1].x);
      const maxRight = Math.max(...[...res.nodes.values()].map((n) => n.x + n.width));
      expect(e.waypoints![0].x).toBeGreaterThan(maxRight);
    }
  });

  it("dashes against-flow (backward) edges and only those (AC-4)", () => {
    // Search (catalog band, below) → Wallet (payments band, above) runs against
    // the top-to-bottom flow with no return path (acyclic).
    const withBack = SYS.replace(
      'Search -> Catalog "read"',
      'Search -> Catalog "read"\n  Search -> Wallet "notify"',
    );
    const res = layoutOf(withBack, OWNER, "team");
    expect(edge(res, "Search", "Wallet").groupBackward).toBe(true);
    // Forward edges are not flagged.
    expect(edge(res, "Billing", "Wallet").groupBackward).toBeFalsy();
    expect(edge(res, "Billing", "ShopDB").groupBackward).toBeFalsy();
  });

  it("keeps penetration == 0 with a single team (degenerate)", () => {
    const oneTeam = new Map([
      ["Billing", "payments"],
      ["Wallet", "payments"],
    ]);
    const res = layoutOf(SYS, oneTeam, "team");
    expect(totalPenetrations(res)).toBe(0);
  });
});

// Three single-service teams stacked over a shared infra store (DB) and external
// service (EXT), so DB and EXT each have two *far* (gutter-routed) incoming
// edges → each forms an aggregation trunk.
const TRUNKS = `
system Shop {
  service A { label "A" }
  service B { label "B" }
  service C { label "C" }
  database DB { label "DB" }
  service EXT [external] { label "EXT" }
  A -> DB "w"
  B -> DB "w"
  A -> EXT "call"
  B -> EXT "call"
}
organization Org {
  team "alpha" { label "Alpha" owns A }
  team "beta" { label "Beta" owns B }
  team "gamma" { label "Gamma" owns C }
}`;

const TRUNKS_OWNER = new Map([
  ["A", "alpha"],
  ["B", "beta"],
  ["C", "gamma"],
]);

describe("aggregateGroupTrunks (#1859, P2c-B)", () => {
  it("merges edges to a shared target onto one trunk lane and tags trunkId (AC-2)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    for (const [from, to] of [
      ["A", "DB"],
      ["B", "DB"],
    ] as const) {
      const e = edge(res, from, to);
      expect(e.trunkId).toBe("DB");
      expect(e.waypoints).toHaveLength(2);
    }
    // Both DB edges share one vertical spine x and enter the target at one point.
    const aDb = edge(res, "A", "DB");
    const bDb = edge(res, "B", "DB");
    expect(aDb.waypoints![0].x).toBe(bDb.waypoints![0].x); // same trunk lane
    expect(aDb.toPoint).toEqual(bDb.toPoint); // one shared target entry
    // The elbow where each stub meets the spine is that edge's merge point.
    expect(aDb.waypoints![0].y).toBe(aDb.fromPoint.y);
    expect(bDb.waypoints![0].y).toBe(bDb.fromPoint.y);
    // A trunked edge must not stay flagged `groupBackward`: it co-renders on the
    // shared spine, so a dash would stripe only its half of that spine.
    expect(aDb.groupBackward).toBeFalsy();
    expect(bDb.groupBackward).toBeFalsy();
  });

  it("gives distinct shared targets distinct trunk lanes (no spine overlap)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    const dbLane = edge(res, "A", "DB").waypoints![0].x;
    const extLane = edge(res, "A", "EXT").waypoints![0].x;
    expect(edge(res, "B", "EXT").trunkId).toBe("EXT");
    expect(dbLane).not.toBe(extLane);
  });

  it("keeps penetration == 0 after trunking (AC-1 preserved)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    expect(totalPenetrations(res)).toBe(0);
  });

  it("keeps every trunk spine inside the layout width (no viewport clipping)", () => {
    // computeTotalDimensions must account for trunk-lane waypoints, else lane ≥ 1
    // spines render past the SVG width and get clipped.
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    for (const e of res.edges) {
      for (const wp of [e.fromPoint, e.toPoint, ...(e.waypoints ?? [])]) {
        // Both axes: computeTotalDimensions folds edge y as well as x, so a
        // downward trunk vertical must stay inside the height too.
        expect(wp.x).toBeLessThanOrEqual(res.width);
        expect(wp.x).toBeGreaterThanOrEqual(0);
        expect(wp.y).toBeLessThanOrEqual(res.height);
        expect(wp.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not trunk a target with only one incoming edge", () => {
    // Only A → DB (single incoming); no trunk should form.
    const single = `
system Shop {
  service A { label "A" }
  service B { label "B" }
  service C { label "C" }
  database DB { label "DB" }
  A -> DB "w"
}
organization Org {
  team "alpha" { label "Alpha" owns A }
  team "beta" { label "Beta" owns B }
  team "gamma" { label "Gamma" owns C }
}`;
    const res = layoutOf(single, TRUNKS_OWNER, "team");
    expect(edge(res, "A", "DB").trunkId).toBeUndefined();
    expect(totalPenetrations(res)).toBe(0);
  });
});

/**
 * Every strict-interior right-angle crossing between two *different* edges,
 * as {x, y}. This is the set P2c-C must mark with a hop (TPL-20260711-02:
 * assert every crossing carries a mark, not that the crossing count is zero).
 */
function rightAngleCrossings(res: LayoutResult): Point[] {
  const EPS = 1e-6;
  interface Seg {
    a: number;
    b: number;
    fixed: number;
    edge: number;
    horizontal: boolean;
  }
  const segs: Seg[] = [];
  res.edges.forEach((e, edgeIdx) => {
    if (e.ghost || e.cyclic) return;
    const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (Math.abs(p.y - q.y) < EPS && Math.abs(p.x - q.x) >= EPS) {
        segs.push({
          a: Math.min(p.x, q.x),
          b: Math.max(p.x, q.x),
          fixed: p.y,
          edge: edgeIdx,
          horizontal: true,
        });
      } else if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) >= EPS) {
        segs.push({
          a: Math.min(p.y, q.y),
          b: Math.max(p.y, q.y),
          fixed: p.x,
          edge: edgeIdx,
          horizontal: false,
        });
      }
    }
  });
  const out: Point[] = [];
  for (const h of segs.filter((s) => s.horizontal)) {
    for (const v of segs.filter((s) => !s.horizontal)) {
      if (h.edge === v.edge) continue;
      if (
        v.fixed > h.a + EPS &&
        v.fixed < h.b - EPS &&
        h.fixed > v.a + EPS &&
        h.fixed < v.b - EPS
      ) {
        out.push({ x: v.fixed, y: h.fixed });
      }
    }
  }
  return out;
}

describe("computeCrossingMarks (#1859, P2c-C)", () => {
  it("sets crossingMarks in the grouped view and leaves it undefined ungrouped (AC-5)", () => {
    expect(layoutOf(TRUNKS, TRUNKS_OWNER, "team").crossingMarks).toBeDefined();
    expect(layoutOf(TRUNKS, TRUNKS_OWNER).crossingMarks).toBeUndefined();
  });

  it("marks a junction dot at every trunk stub-join elbow (AC-2)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    const junctions = res.crossingMarks!.junctions;
    // Each trunked edge's waypoints[0] is a merge point; all four are distinct.
    const trunked = res.edges.filter((e) => e.trunkId !== undefined);
    expect(trunked.length).toBeGreaterThanOrEqual(2);
    for (const e of trunked) {
      const wp0 = e.waypoints![0];
      expect(junctions).toContainEqual({ x: wp0.x, y: wp0.y });
    }
  });

  it("draws a hop over every right-angle crossing — none can be misread as a connection (AC-3, TPL-20260711-02)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    const hops = res.crossingMarks!.hops;
    const crossings = rightAngleCrossings(res);
    // Dual metric: crossings are *observed* (not asserted to zero); each must be
    // covered by a hop arc so the crossing reads as "not connected".
    const uncovered = crossings.filter(
      (c) =>
        !hops.some(
          (m) =>
            Math.abs(m.y - c.y) < 1e-6 &&
            c.x >= m.x - m.halfWidth - 1e-6 &&
            c.x <= m.x + m.halfWidth + 1e-6,
        ),
    );
    expect(uncovered).toEqual([]);
    // And no hop is invented where there is no crossing.
    expect(hops.length).toBeLessThanOrEqual(crossings.length);
  });
});
