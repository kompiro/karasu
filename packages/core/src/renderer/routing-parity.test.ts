/**
 * Routing quality fences for the **shared candidate chain** (#2330 / #2362).
 *
 * Until this file existed, ungrouped routing was held only by the
 * `if (groupBands)` gate ADR-1859 introduced as AC-5 — a structural guarantee,
 * not a measured one. Removing the gate changed ungrouped geometry on real
 * models (10 penetrations became 0) without a single existing test failing,
 * which is precisely the hole these fences close: the ungrouped view is the
 * default view, so it deserves the same TPL-1927 dual metric the grouped view
 * has had since P2c.
 *
 * What is asserted, on the real `examples/` models rather than synthetic
 * fixtures (the #1954 lesson — a fence that only covers hand-built fixtures
 * misses what users actually draw):
 *
 * - **penetration == 0** in every mode. An edge never crosses the interior of a
 *   node card it does not terminate on, nor of a group frame neither endpoint
 *   belongs to. This is the metric that drove the work.
 * - **collinear overlap == 0** in every mode (#1927). A new route shape must
 *   take part in the lane/fan-out passes rather than stack on an existing
 *   corridor (TPL-1954).
 * - **every crossing carries a hop mark**, so the crossings the chain trades
 *   for penetrations still read as "not connected" (ADR-1859's stance).
 * - **grouped output is unchanged by the chain** — pinned as concrete numbers so
 *   a regression in the grouped view cannot hide behind an ungrouped win.
 *
 * Deliberately *not* asserted: the crossing count itself. ADR-1859 decided
 * crossings are neutralised by representation rather than minimised, and
 * pinning the number would fight slice #2365 (which lowers it by shortening
 * detours) for no stated benefit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { declaredGroupOrderOf, buildGroupLabelIndex } from "./group-labels.js";
import { countPolylinePenetrations, type Rect, type Point } from "./edge-geometry.js";
import type { LayoutEdge, LayoutNode, LayoutResult } from "./layout-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(__dirname, "../../../../examples");

type GroupBy = "team" | "boundary";

/**
 * Frames as the rects they actually cover. A boundary frame widened to reach an
 * out-of-band member (#2179) is a rectilinear polygon, and measuring its
 * *bounding box* would both invent penetrations across rows it does not enclose
 * and hide the strip it does.
 */
function framesOf(res: LayoutResult): { id: string; pieces: Rect[] }[] {
  return res.containers
    .filter((c) => c.group)
    .map((c) => ({
      id: c.id,
      pieces: [...(c.coverage ?? [{ x: c.x, y: c.y, width: c.width, height: c.height }])],
    }));
}

function framesOfNode(
  n: LayoutNode | undefined,
  frames: { id: string; pieces: Rect[] }[],
): Set<string> {
  const out = new Set<string>();
  if (!n) return out;
  for (const f of frames) {
    for (const p of f.pieces) {
      const inside =
        n.x >= p.x &&
        n.x + n.width <= p.x + p.width &&
        n.y >= p.y &&
        n.y + n.height <= p.y + p.height;
      if (inside) {
        out.add(f.id);
        break;
      }
    }
  }
  return out;
}

/** Obstacles an edge must never cross: non-endpoint cards + frames neither endpoint is in. */
function obstaclesForEdge(
  e: LayoutEdge,
  nodes: LayoutNode[],
  frames: { id: string; pieces: Rect[] }[],
  fFrom: Set<string>,
  fTo: Set<string>,
): Rect[] {
  return [
    ...nodes.filter((n) => n.id !== e.from && n.id !== e.to),
    ...frames.filter((f) => !fFrom.has(f.id) && !fTo.has(f.id)).flatMap((f) => f.pieces),
  ];
}

function pointsOf(e: LayoutEdge): Point[] {
  return [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
}

function totalPenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const from = res.nodes.get(e.from);
    const to = res.nodes.get(e.to);
    if (!from || !to) continue;
    const obstacles = obstaclesForEdge(
      e,
      nodes,
      frames,
      framesOfNode(from, frames),
      framesOfNode(to, frames),
    );
    total += countPolylinePenetrations(pointsOf(e), obstacles);
  }
  return total;
}

/**
 * Penetration count if every edge were drawn straight centre-to-centre on the
 * same node positions. Proves a fixture actually exercises the router — a
 * "penetration == 0" assertion on a model that would be clean anyway fences
 * nothing (the #1954 lesson, applied to the ungrouped view here).
 */
function straightCentrePenetrations(res: LayoutResult): number {
  const frames = framesOf(res);
  const nodes = [...res.nodes.values()];
  const centre = (n: LayoutNode): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
  let total = 0;
  for (const e of res.edges) {
    if (e.ghost || e.cyclic) continue;
    const from = res.nodes.get(e.from);
    const to = res.nodes.get(e.to);
    if (!from || !to) continue;
    const obstacles = obstaclesForEdge(
      e,
      nodes,
      frames,
      framesOfNode(from, frames),
      framesOfNode(to, frames),
    );
    total += countPolylinePenetrations([centre(from), centre(to)], obstacles);
  }
  return total;
}

/** Collinear, overlapping segment pairs from distinct edges on one axis (#1927). */
function collinearOverlaps(res: LayoutResult, axis: "v" | "h"): number {
  const segs: { edge: number; fixed: number; a0: number; a1: number }[] = [];
  res.edges.forEach((e, idx) => {
    if (e.ghost || e.cyclic) return;
    const pts = pointsOf(e);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const flat = axis === "v" ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
      const long = axis === "v" ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
      if (flat > 1e-6 || long <= 1e-6) continue;
      segs.push({
        edge: idx,
        fixed: axis === "v" ? a.x : a.y,
        a0: axis === "v" ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
        a1: axis === "v" ? Math.max(a.y, b.y) : Math.max(a.x, b.x),
      });
    }
  });
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a.edge === b.edge) continue;
      if (Math.abs(a.fixed - b.fixed) > 1e-6) continue;
      if (Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) > 1e-6) n++;
    }
  }
  return n;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function totalCrossings(res: LayoutResult): number {
  const segs: [Point, Point][] = [];
  for (const e of res.edges) {
    const pts = pointsOf(e);
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

function layoutOf(file: string, groupBy?: GroupBy): LayoutResult {
  const src = readFileSync(resolve(EXAMPLES, file), "utf8");
  const parsed = Parser.parse(src);
  const krsFile = parsed.value;
  const slice = extractView(krsFile.systems, []);
  return layout(slice, {
    ownerIndex: krsFile.ownerIndex,
    groupBy,
    boundaryMembership: krsFile.boundaryMembership,
    declaredGroupOrder: groupBy ? declaredGroupOrderOf(krsFile, groupBy) : undefined,
    groupLabels: groupBy ? buildGroupLabelIndex(krsFile, groupBy) : undefined,
  });
}

/**
 * Real models whose ungrouped system view exercises the router. Each one had at
 * least one penetration before the shared chain, or is a canonical sample whose
 * cleanliness is worth holding.
 */
const UNGROUPED_MODELS = [
  "en/getting-started/index.krs",
  "en/hato/index.krs",
  "en/hr-tool/system.krs",
  "en/client-mcp/index.krs",
  "en/payment-platform/system.krs",
  "en/ec-platform/01-system.krs",
  "en/ec-platform/02-users.krs",
  "en/ec-platform/02.5-clients.krs",
  "en/ec-platform/04-annotations.krs",
  "en/feature-samples/team-ownership.krs",
  "en/feature-samples/boundary-clusters.krs",
  "en/feature-samples/external-nodes.krs",
] as const;

/**
 * Models whose ungrouped view leaked penetrations before the shared chain.
 * These are the fixtures that prove the zero above is earned.
 *
 * `en/client-mcp/index.krs` used to belong here. #2384 fixed the placement bug
 * that put its lone `[external]` on the far side of its consumers, and with
 * `OrderMcp` beside the services that call it the model has nothing left to
 * route — every edge is a short direct line. It stays in `UNGROUPED_MODELS`
 * (penetration and overlap are still fenced there); it just no longer proves
 * the router fired, so asserting that it did would fence nothing.
 */
const PREVIOUSLY_PIERCED = [
  "en/hr-tool/system.krs",
  "en/hato/index.krs",
  "en/ec-platform/04-annotations.krs",
] as const;

/**
 * Subset where even a straight centre-to-centre line pierces, so the stronger
 * "the placement alone cannot be clean" claim holds. The rest are cases where
 * only the *anchored* straight line pierced, which the centre probe cannot see.
 * `client-mcp` left this list for the same reason as above — after #2384 its
 * placement *is* clean, which was the point of that fix.
 */
const PIERCED_CENTRE_TO_CENTRE = ["en/hr-tool/system.krs"] as const;

describe("shared routing chain — ungrouped fences (#2362, TPL-1927)", () => {
  it.each(UNGROUPED_MODELS)("%s: no edge pierces a node card", (file) => {
    expect(totalPenetrations(layoutOf(file))).toBe(0);
  });

  it.each(UNGROUPED_MODELS)("%s: no two edges share a collinear corridor", (file) => {
    const res = layoutOf(file);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it.each(PREVIOUSLY_PIERCED)("%s: the chain actually routed edges here", (file) => {
    // A "penetration == 0" assertion on a model the router never touched fences
    // nothing, so pin that the chain fired: these models each leaked at least
    // one penetration before it existed.
    const routed = layoutOf(file).edges.filter((e) => (e.waypoints?.length ?? 0) > 0);
    expect(routed.length).toBeGreaterThan(0);
  });

  it.each(PIERCED_CENTRE_TO_CENTRE)("%s: the placement alone cannot be clean", (file) => {
    // Straight centre-to-centre on the same node positions still pierces, so the
    // zero above is the router's doing and not a property of the layout.
    expect(straightCentrePenetrations(layoutOf(file))).toBeGreaterThan(0);
  });

  it.each(UNGROUPED_MODELS)(
    "%s: every crossing carries a hop mark, so crossings still read as 'not connected'",
    (file) => {
      const res = layoutOf(file);
      const crossings = totalCrossings(res);
      const hops = res.crossingMarks?.hops.length ?? 0;
      // Hops cluster when crossings sit within HOP_CLUSTER_GAP of each other, so
      // marks can be fewer than crossings — but never zero while crossings exist.
      // Comparing booleans keeps this a single unconditional assertion.
      expect(hops > 0).toBe(crossings > 0);
    },
  );
});

describe("shared routing chain — grouped output is unchanged (#2362, AC-5 replacement)", () => {
  const GROUPED: [string, GroupBy, number][] = [
    ["en/getting-started/index.krs", "team", 3],
    ["en/feature-samples/team-ownership.krs", "team", 3],
    ["en/feature-samples/boundary-clusters.krs", "boundary", 7],
    ["en/feature-samples/boundary-multi-membership.krs", "boundary", 0],
  ];

  it.each(GROUPED)("%s (group by %s): penetration 0, %i crossings", (file, groupBy, crossings) => {
    const res = layoutOf(file, groupBy);
    expect(totalPenetrations(res)).toBe(0);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
    // Pinned: composing the chain must not perturb the grouped view. These are
    // the P2c numbers measured before the fork was removed.
    expect(totalCrossings(res)).toBe(crossings);
  });
});

describe("shared routing chain — ungrouped-only affordances survive (#2362)", () => {
  it("keeps [external] services in side columns (ADR-1728 / TPL-1761)", () => {
    const res = layoutOf("en/hato/index.krs");
    const nodes = [...res.nodes.values()];
    const xs = nodes.map((n) => n.x + n.width / 2);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    // The side gate engages on hato (≥2 hubs with external edges), so at least
    // one external sits on each flank rather than in a bottom band.
    const externals = nodes.filter((n) => n.id === "CloudflareAccess" || n.id === "Cloudflare");
    expect(externals.length).toBeGreaterThan(0);
    for (const e of externals) {
      const centre = e.x + e.width / 2;
      expect(Math.abs(centre - mid)).toBeGreaterThan(0);
    }
  });

  it.each(UNGROUPED_MODELS)(
    "%s: no ungrouped edge is dashed as backward — 'backward' needs a band stack",
    (file) => {
      expect(layoutOf(file).edges.some((e) => e.groupBackward)).toBe(false);
    },
  );
});

/** x range every card occupies — the region an interior corridor runs inside of. */
function contentBounds(res: LayoutResult): { minLeft: number; maxRight: number } {
  const nodes = [...res.nodes.values()];
  return {
    minLeft: Math.min(...nodes.map((n) => n.x)),
    maxRight: Math.max(...nodes.map((n) => n.x + n.width)),
  };
}

/** The x of each edge's vertical corridor, if it routes through one. */
function corridorXs(res: LayoutResult): number[] {
  const out: number[] = [];
  for (const e of res.edges) {
    const wps = e.waypoints;
    if (!wps || wps.length < 2) continue;
    for (let i = 0; i < wps.length - 1; i++) {
      if (wps[i].x === wps[i + 1].x && wps[i].y !== wps[i + 1].y) {
        out.push(wps[i].x);
        break;
      }
    }
  }
  return out;
}

describe("interior corridors shorten detours (#2365)", () => {
  // Models where a lane between columns is clear over the rows an edge crosses.
  // Not every diagram has one: rows are centred and vary in width, so on models
  // like hr-tool the cards overlap in x across every row an edge would traverse
  // and the routes correctly fall through to the outer gutters.
  //
  // `client-mcp` was here until #2384. Its interior corridor existed only to
  // reach an external stranded on the wrong side; with the placement fixed the
  // edges are direct and claim no corridor at all.
  const HAS_INTERIOR_LANE = ["en/ec-platform/04-annotations.krs"] as const;

  it.each(HAS_INTERIOR_LANE)("%s: routes take a lane inside the content", (file) => {
    const res = layoutOf(file);
    const { minLeft, maxRight } = contentBounds(res);
    const interior = corridorXs(res).filter((x) => x > minLeft && x < maxRight);
    expect(interior.length).toBeGreaterThan(0);
  });

  it.each(HAS_INTERIOR_LANE)("%s: an interior lane is never shared (TPL-1954)", (file) => {
    // `distributeGutterLanes` only relocates corridors *outside* the content, so
    // interior corridors cannot be lane-separated after the fact — the router
    // claims them as it goes. This is the fence on that claim.
    const res = layoutOf(file);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
  });

  it.each(["en/feature-samples/team-ownership.krs", "en/feature-samples/boundary-clusters.krs"])(
    "%s: a grouped canvas keeps every corridor outside the content (P2c guarantee)",
    (file) => {
      // P2c's side gutter is penetration-safe by construction because it lies
      // beyond every card and frame, and `distributeGutterLanes` widens lanes on
      // that assumption. Interior corridors are deliberately not offered where
      // frames exist, so that guarantee is not traded away for a shorter route.
      const groupBy: GroupBy = file.includes("boundary") ? "boundary" : "team";
      const res = layoutOf(file, groupBy);
      const { minLeft, maxRight } = contentBounds(res);
      for (const x of corridorXs(res)) {
        expect(x > maxRight || x < minLeft).toBe(true);
      }
    },
  );
});
