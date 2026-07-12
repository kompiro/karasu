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
  return res.containers.filter((c) => c.group).map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height }));
}

/** Frame id enclosing a node, or null. Frames are disjoint (P2a). */
function frameOfNode(n: LayoutNode, frames: (Rect & { id: string })[]): string | null {
  for (const f of frames) {
    if (n.x >= f.x && n.x + n.width <= f.x + f.width && n.y >= f.y && n.y + n.height <= f.y + f.height) return f.id;
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
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
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
    for (const [from, to] of [["Billing", "Catalog"], ["Billing", "ShopDB"], ["Billing", "Stripe"]] as const) {
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
    const withBack = SYS.replace('Search -> Catalog "read"', 'Search -> Catalog "read"\n  Search -> Wallet "notify"');
    const res = layoutOf(withBack, OWNER, "team");
    expect(edge(res, "Search", "Wallet").groupBackward).toBe(true);
    // Forward edges are not flagged.
    expect(edge(res, "Billing", "Wallet").groupBackward).toBeFalsy();
    expect(edge(res, "Billing", "ShopDB").groupBackward).toBeFalsy();
  });

  it("keeps penetration == 0 with a single team (degenerate)", () => {
    const oneTeam = new Map([["Billing", "payments"], ["Wallet", "payments"]]);
    const res = layoutOf(SYS, oneTeam, "team");
    expect(totalPenetrations(res)).toBe(0);
  });
});
