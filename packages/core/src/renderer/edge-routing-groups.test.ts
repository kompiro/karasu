import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { countPolylinePenetrations, type Rect, type Point } from "./edge-geometry.js";
import type { LayoutEdge, LayoutNode, LayoutResult } from "./layout-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function layoutOf(
  krs: string,
  ownerIndex: Map<string, string>,
  groupBy?: "team",
  collapsedGroups?: ReadonlySet<string>,
): LayoutResult {
  const parsed = Parser.parse(krs);
  const slice = extractView(parsed.value.systems, []);
  return layout(slice, { ownerIndex, groupBy, collapsedGroups });
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

/**
 * #1927 metric: count pairs of *distinct* edges whose vertical segments are
 * collinear (share an x) and whose y-ranges overlap on a sub-segment of positive
 * length — i.e. two corridors drawn as one indistinguishable line. Must be 0.
 *
 * Trunk siblings (same `trunkId`) intentionally share one spine — that is the
 * aggregation merge (marked by a junction dot in P2c-C), a *connection* not a
 * false overlap — so they are excluded.
 */
function collinearVerticalOverlaps(res: LayoutResult): number {
  interface VSeg {
    edge: LayoutEdge;
    x: number;
    lo: number;
    hi: number;
  }
  const verticals: VSeg[] = [];
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (p.x === q.x && p.y !== q.y) {
        verticals.push({ edge: e, x: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
      }
    }
  }
  let n = 0;
  for (let i = 0; i < verticals.length; i++) {
    for (let j = i + 1; j < verticals.length; j++) {
      const a = verticals[i];
      const b = verticals[j];
      if (a.edge === b.edge) continue;
      // Trunk siblings share one spine by design (aggregation merge, not a defect).
      if (a.edge.trunkId && a.edge.trunkId === b.edge.trunkId) continue;
      if (a.x !== b.x) continue;
      // Positive-length overlap (touching endpoints do not count as overlap).
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0) n++;
    }
  }
  return n;
}

/**
 * #1927 source-exit metric: count pairs of *distinct* edges whose *horizontal*
 * segments are collinear (share a y) and overlap on a sub-segment of positive
 * length — e.g. two gutter edges leaving one node on the same mid-edge port, whose
 * stubs run as one line before branching. Must be 0 after source fan-out. Trunk
 * siblings share a target-entry stub by design, so they are excluded.
 */
function collinearHorizontalOverlaps(res: LayoutResult): number {
  interface HSeg {
    edge: LayoutEdge;
    y: number;
    lo: number;
    hi: number;
  }
  const horizontals: HSeg[] = [];
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (p.y === q.y && p.x !== q.x) {
        horizontals.push({ edge: e, y: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
      }
    }
  }
  let n = 0;
  for (let i = 0; i < horizontals.length; i++) {
    for (let j = i + 1; j < horizontals.length; j++) {
      const a = horizontals[i];
      const b = horizontals[j];
      if (a.edge === b.edge) continue;
      if (a.edge.trunkId && a.edge.trunkId === b.edge.trunkId) continue;
      if (a.y !== b.y) continue;
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0) n++;
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

  it("gives single-incoming gutter edges distinct lanes so no two share a collinear corridor (#1927, AC-1)", () => {
    // Billing → {Catalog, ShopDB, Stripe} are three non-trunked gutter edges from
    // one source (each target has only one incoming), so their corridors all start
    // at Billing's center y and overlap in y-range — collinear if laid on one x.
    const res = layoutOf(SYS, OWNER, "team");
    const eCat = edge(res, "Billing", "Catalog");
    const eDb = edge(res, "Billing", "ShopDB");
    const eStr = edge(res, "Billing", "Stripe");
    // None is trunked (each target is single-incoming among gutter routes).
    for (const e of [eCat, eDb, eStr]) {
      expect(e.trunkId).toBeUndefined();
      expect(e.waypoints).toHaveLength(2);
    }
    // Each colliding corridor gets its own lane x → three distinct columns.
    const xs = new Set([eCat.waypoints![0].x, eDb.waypoints![0].x, eStr.waypoints![0].x]);
    expect(xs.size).toBe(3);
    // No two distinct edges render a collinear (overlapping) vertical corridor.
    expect(collinearVerticalOverlaps(res)).toBe(0);
    // AC-1 preserved: still zero node/frame penetrations after laning.
    expect(totalPenetrations(res)).toBe(0);
  });

  it("fans out the source anchors of edges leaving one node, so their stubs don't overlap (#1927 source-exit)", () => {
    // Billing → {Catalog, ShopDB, Stripe} all leave Billing on the right gutter.
    // Without fan-out they share Billing's mid-right port and their horizontal
    // stubs are collinear (render as one line until they branch).
    const res = layoutOf(SYS, OWNER, "team");
    const eCat = edge(res, "Billing", "Catalog");
    const eDb = edge(res, "Billing", "ShopDB");
    const eStr = edge(res, "Billing", "Stripe");
    // Fanned: the three source anchors are now at distinct y (own stub each).
    const ys = new Set([eCat.fromPoint.y, eDb.fromPoint.y, eStr.fromPoint.y]);
    expect(ys.size).toBe(3);
    // The corridor top elbow follows the anchor y (the stub is truly horizontal).
    for (const e of [eCat, eDb, eStr]) expect(e.waypoints![0].y).toBe(e.fromPoint.y);
    // Anchors stay on Billing's right edge (same x), inside its height.
    const from = res.nodes.get("Billing")!;
    for (const e of [eCat, eDb, eStr]) {
      expect(e.fromPoint.x).toBe(from.x + from.width);
      expect(e.fromPoint.y).toBeGreaterThan(from.y);
      expect(e.fromPoint.y).toBeLessThan(from.y + from.height);
    }
    // No two distinct edges share a collinear horizontal (source-stub) segment,
    // and the vertical corridors and penetration guard still hold.
    expect(collinearHorizontalOverlaps(res)).toBe(0);
    expect(collinearVerticalOverlaps(res)).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
  });

  it("leaves a lone gutter edge on its mid-edge port (no needless fan-out)", () => {
    // Only Billing → Stripe leaves Billing to the far right on its own here (the
    // single-source case): the port stays at mid-height, no churn.
    const oneFar = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }
  service Stripe [external] { label "Stripe" }
  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Stripe "authorize"
}
organization Org {
  team "payments" { label "Payments" owns Billing owns Wallet }
  team "catalog" { label "Catalog" owns Search owns Catalog }
}`;
    const res = layoutOf(oneFar, OWNER, "team");
    const e = edge(res, "Billing", "Stripe");
    const from = res.nodes.get("Billing")!;
    expect(e.waypoints).toHaveLength(2);
    expect(e.fromPoint.y).toBe(from.y + from.height / 2); // untouched mid-edge port
    expect(totalPenetrations(res)).toBe(0);
  });

  it("fans out incoming edges too — a node's entry anchors don't overlap outgoing stubs (#1927 entry-side)", () => {
    // Checkout both sends to platform (order placed → Notifications) and receives
    // from it (route ← Gateway). Collapsing `platform` re-targets both onto the
    // stub, so `route` now *enters* Checkout on its right gutter alongside its
    // outgoing edges — without entry-side fan-out the incoming stub sits on top of
    // an outgoing stub at Checkout's mid-edge port.
    const BIDIR = `
system Shop {
  service Checkout { label "Checkout" }
  service Billing { label "Billing" }
  service Search { label "Search" }
  service Inventory { label "Inventory" }
  service Gateway { label "API Gateway" }
  service Notifications { label "Notifications" }
  database OrderDB { label "Order DB" }
  Gateway -> Search "route"
  Gateway -> Checkout "route"
  Checkout -> Billing "charge"
  Checkout -> Inventory "reserve"
  Search -> Inventory "read"
  Checkout -> OrderDB "persist"
  Checkout -> Notifications "order placed"
}
organization Org {
  team "payments" { label "Payments" owns Checkout owns Billing }
  team "catalog" { label "Catalog" owns Search owns Inventory }
  team "platform" { label "Platform" owns Gateway owns Notifications }
}`;
    const owner = new Map([
      ["Checkout", "payments"],
      ["Billing", "payments"],
      ["Search", "catalog"],
      ["Inventory", "catalog"],
      ["Gateway", "platform"],
      ["Notifications", "platform"],
    ]);
    const res = layoutOf(BIDIR, owner, "team", new Set(["platform"]));
    // No two distinct edges share a collinear horizontal (stub) segment anywhere,
    // and the vertical corridors and penetration guard still hold with a collapse.
    expect(collinearHorizontalOverlaps(res)).toBe(0);
    expect(collinearVerticalOverlaps(res)).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
    // Find a node that carries BOTH an incoming and an outgoing gutter edge on
    // the same side — that is the entry-vs-exit collision this pass fixes — and
    // assert their anchors are at distinct y (trunk shared-entries excluded, since
    // those legitimately merge at one point).
    let sawMixedNode = false;
    for (const n of res.nodes.values()) {
      const attachYs: number[] = [];
      let hasIn = false;
      let hasOut = false;
      for (const e of res.edges) {
        if (e.ghost || e.cyclic || !e.waypoints || e.waypoints.length !== 2) continue;
        if (e.waypoints[0].x !== e.waypoints[1].x) continue;
        const cx = e.waypoints[0].x;
        if (!(cx >= n.x + n.width || cx <= n.x)) continue; // gutter side of n
        if (e.from === n.id) {
          attachYs.push(e.fromPoint.y);
          hasOut = true;
        }
        if (e.to === n.id && !e.trunkId) {
          attachYs.push(e.toPoint.y);
          hasIn = true;
        }
      }
      // Distinct anchors ⇒ no two stubs collinear at this node's edge.
      expect(new Set(attachYs).size).toBe(attachYs.length);
      if (hasIn && hasOut) sawMixedNode = true;
    }
    // Guard that the collapsed fixture actually exercises the entry-vs-exit case.
    expect(sawMixedNode).toBe(true);
  });

  it("fans out a collapsed stub whose team name contains a space (no id-key mis-parse)", () => {
    // A team named with a space collapses to `__group_collapsed_<name>__` — an id
    // that contains a space. Grouping attachments by a delimited string key would
    // mis-split it and skip the node, leaving its stubs overlapping.
    const spaced = `
system Shop {
  service Checkout { label "Checkout" }
  service Billing { label "Billing" }
  service Search { label "Search" }
  service Inventory { label "Inventory" }
  service Gateway { label "API Gateway" }
  service Notifications { label "Notifications" }
  Gateway -> Search "route"
  Gateway -> Checkout "route"
  Checkout -> Billing "charge"
  Checkout -> Inventory "reserve"
  Search -> Inventory "read"
  Checkout -> Notifications "order placed"
}
organization Org {
  team "payments" { owns Checkout owns Billing }
  team "catalog" { owns Search owns Inventory }
  team "Data Platform" { owns Gateway owns Notifications }
}`;
    const owner = new Map([
      ["Checkout", "payments"],
      ["Billing", "payments"],
      ["Search", "catalog"],
      ["Inventory", "catalog"],
      ["Gateway", "Data Platform"],
      ["Notifications", "Data Platform"],
    ]);
    const res = layoutOf(spaced, owner, "team", new Set(["Data Platform"]));
    // The collapsed stub (space in its id) still gets its incoming/outgoing stubs
    // fanned apart — no collinear overlap anywhere.
    expect(collinearHorizontalOverlaps(res)).toBe(0);
    expect(collinearVerticalOverlaps(res)).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
  });

  it("keeps single-edge lanes distinct from trunk lanes — no lane-x collision (#1927, AC-3)", () => {
    // Adding Wallet → ShopDB makes ShopDB fan-in (Billing + Wallet) → a trunk,
    // while Billing → {Catalog, Stripe} stay single-incoming gutter edges — so a
    // non-trunked corridor coexists with a trunk lane.
    const mixed = SYS.replace(
      'Billing -> ShopDB "persist"',
      'Billing -> ShopDB "persist"\n  Wallet -> ShopDB "persist"',
    );
    const res = layoutOf(mixed, OWNER, "team");
    expect(edge(res, "Billing", "ShopDB").trunkId).toBe("ShopDB"); // trunked
    const bStripe = edge(res, "Billing", "Stripe");
    // Billing → Stripe is a single-incoming gutter edge (not trunked).
    expect(bStripe.trunkId).toBeUndefined();
    expect(bStripe.waypoints).toHaveLength(2);
    const singleLaneX = bStripe.waypoints![0].x;
    // Collect every trunk lane x; the single-edge lane must not collide with any.
    const trunkXs = new Set(res.edges.filter((e) => e.trunkId).map((e) => e.waypoints![0].x));
    expect(trunkXs.size).toBeGreaterThanOrEqual(1);
    expect(trunkXs.has(singleLaneX)).toBe(false);
    expect(collinearVerticalOverlaps(res)).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
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
  it("sets crossingMarks for a single-system layout whether grouped or not (#1956)", () => {
    // #1956 extended marks to the ungrouped view, so both branches populate it
    // (grouped adds junction dots; ungrouped is hops-only).
    expect(layoutOf(TRUNKS, TRUNKS_OWNER, "team").crossingMarks).toBeDefined();
    expect(layoutOf(TRUNKS, TRUNKS_OWNER).crossingMarks).toBeDefined();
  });

  it("marks a junction dot only at real trunk merges, not at the trunk head (AC-2)", () => {
    const res = layoutOf(TRUNKS, TRUNKS_OWNER, "team");
    const junctions = res.crossingMarks!.junctions;
    // Group trunked edges by spine (trunkId @ elbow x). Each spine's *topmost*
    // stub is the head (an L-corner, no dot); every lower stub is a T-merge (dot).
    const spines = new Map<string, number[]>();
    for (const e of res.edges.filter((x) => x.trunkId !== undefined)) {
      const wp0 = e.waypoints![0];
      const key = `${e.trunkId}@${wp0.x}`;
      const ys = spines.get(key);
      if (ys) ys.push(wp0.y);
      else spines.set(key, [wp0.y]);
    }
    const merges: Point[] = [];
    const heads: Point[] = [];
    for (const [key, ys] of spines) {
      const x = Number(key.split("@")[1]);
      const minY = Math.min(...ys);
      for (const y of ys) (y > minY ? merges : heads).push({ x, y });
    }
    expect(spines.size).toBeGreaterThanOrEqual(1);
    expect(merges.length).toBeGreaterThanOrEqual(1);
    // Every real merge is dotted; no trunk head is.
    expect(merges.every((m) => junctions.some((j) => j.x === m.x && j.y === m.y))).toBe(true);
    expect(heads.some((h) => junctions.some((j) => j.x === h.x && j.y === h.y))).toBe(false);
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

// Real-sample regression for #1954. The synthetic `SYS`/`TRUNKS` fixtures above
// never exercised a target flanked on both sides in the infra tier, nor an actor
// whose straight edge pierces the client row — so the TPL-20260711-02 fence
// (penetration 0) was passing while `examples/en/getting-started` still leaked
// penetrations in the Group-by view. This fixture pins the real example.
const GETTING_STARTED = readFileSync(
  resolve(__dirname, "../../../../examples/en/getting-started/index.krs"),
  "utf8",
);

function layoutGettingStarted(groupBy?: "team"): LayoutResult {
  const parsed = Parser.parse(GETTING_STARTED);
  const slice = extractView(parsed.value.systems, []);
  return layout(slice, { ownerIndex: parsed.value.ownerIndex, groupBy });
}

describe("mixed channel routing on examples/en/getting-started (#1954)", () => {
  it("routes with zero node/frame penetration and zero collinear overlap (AC-1, TPL-20260711-02, #1927)", () => {
    const grouped = layoutGettingStarted("team");
    // The same grouped positions with straight center-to-center edges penetrate
    // (the defect this fixes) — proves the fixture actually drives the router.
    expect(straightCenterPenetrations(grouped)).toBeGreaterThan(0);
    // Dual fence: no edge pierces a node/frame, AND no two edges render as one
    // collinear line (a false connection). A naive top/bottom-port fallback hits
    // penetration 0 but reintroduces overlaps; mixed routing + the generalized
    // lane/fan-out passes hold both to 0.
    expect(totalPenetrations(grouped)).toBe(0);
    expect(collinearVerticalOverlaps(grouped)).toBe(0);
    expect(collinearHorizontalOverlaps(grouped)).toBe(0);
  });

  it("mixed-routes the two edges that a plain side gutter cannot clear", () => {
    const res = layoutGettingStarted("team");
    // ECommerce -> OrderEvents: target OrderEvents is flanked by ECommerceDB /
    // MediaStorage in the infra tier, so it is entered via a top channel stub.
    // Seller -> ECommerce: source Seller is blocked by the actor row, so it exits
    // via a bottom channel stub. Both become multi-waypoint mixed routes (a plain
    // 2-waypoint side gutter route could not clear either).
    const eco = edge(res, "ECommerce", "OrderEvents");
    const seller = edge(res, "Seller", "ECommerce");
    expect((eco.waypoints ?? []).length).toBeGreaterThan(2);
    expect((seller.waypoints ?? []).length).toBeGreaterThan(2);
    // Neither is left straight-through (the pre-fix state was 0 waypoints).
    expect(eco.waypoints).toBeDefined();
    expect(seller.waypoints).toBeDefined();
  });

  it("does not group or mixed-route the ungrouped (Group by: none) view (AC-5)", () => {
    // AC-5: the ungrouped pipeline is untouched — no group frames, so the grouped
    // routing (and its mixed-route fallback) never runs. The two edges that get
    // mixed routes when grouped are NOT rerouted here.
    const ungrouped = layoutGettingStarted();
    expect(ungrouped.containers.some((c) => c.group)).toBe(false);
    for (const [from, to] of [
      ["ECommerce", "OrderEvents"],
      ["Seller", "ECommerce"],
    ] as const) {
      // The grouped mixed route bends through 3 gutter/channel waypoints; the
      // ungrouped pipeline does not produce that shape for these edges.
      expect((edge(ungrouped, from, to).waypoints ?? []).length).toBeLessThan(3);
    }
  });
});
