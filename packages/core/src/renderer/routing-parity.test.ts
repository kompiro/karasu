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
import { renderFromLayout } from "./svg-renderer.js";
import { layoutDeploy } from "./deploy-layout.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import "./shapes.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { declaredGroupOrderOf, buildGroupLabelIndex } from "./group-labels.js";
import { countPolylinePenetrations, type Rect, type Point } from "./edge-geometry.js";
import { collectChannels } from "./edge-routing-lanes.js";
import { HOP_RADIUS, trunkBandHalfWidth } from "./crossing-marks.js";
import { labelAnchorWithSegment, ownLabelSegment } from "./edge-routing.js";
import { ObstacleIndex } from "./obstacle-index.js";
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

/**
 * Collinear, overlapping segment pairs from distinct edges on one axis (#1927),
 * **excluding a trunk's siblings**, which share one spine and one target entry
 * because that is what the aggregation is (ADR-1859 AC-2, #2631), or one spine
 * and one source exit for a fan-out trunk (#2885). The unit-level
 * helper of the same name has excluded them since P2c-B; this one did not, and
 * the corpus happened to contain no trunk at all, so its zero said nothing about
 * the case (TPL-2598). `trunkSiblingsShareOneSpine` below asserts the exemption
 * positively, so the pairs this skips are pinned rather than merely ignored.
 */
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
      const ea = res.edges[a.edge];
      const eb = res.edges[b.edge];
      if (ea.trunkId !== undefined && ea.trunkId === eb.trunkId) continue;
      if (ea.outTrunkId !== undefined && ea.outTrunkId === eb.outTrunkId) continue;
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
  return layoutOfSource(readFileSync(resolve(EXAMPLES, file), "utf8"), groupBy);
}

function layoutOfSource(src: string, groupBy?: GroupBy): LayoutResult {
  const parsed = Parser.parse(src);
  const krsFile = parsed.value;
  const slice = extractView(krsFile.systems, []);
  const styles = resolveStyles(krsFile.systems, [getBuiltinStyleSheet()]);
  return layout(slice, {
    ownerIndex: krsFile.ownerIndex,
    groupBy,
    boundaryMembership: krsFile.boundaryMembership,
    declaredGroupOrder: groupBy ? declaredGroupOrderOf(krsFile, groupBy) : undefined,
    groupLabels: groupBy ? buildGroupLabelIndex(krsFile, groupBy) : undefined,
    // The renderer always passes these, and since #2422 they move endpoints:
    // a fence that left them out would measure a diagram nobody sees.
    shapeForNode: (id) => {
      const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
      return typeof style.shape === "string" ? style.shape : style.shape.url;
    },
    chipZoneFor: (node) => ({
      x: node.x + node.width - CHIP_LANE_WIDTH,
      y: node.y,
      width: CHIP_LANE_WIDTH,
      height: CHIP_LANE_HEIGHT,
    }),
  });
}

/** The resolved styles for a source, as `renderFromLayout` needs them. */
function stylesOfSource(src: string) {
  const krsFile = Parser.parse(src).value;
  return resolveStyles(krsFile.systems, [getBuiltinStyleSheet()]);
}

/** A typical corner lane: two buttons and a short chip (#2420). */
const CHIP_LANE_WIDTH = 72;
const CHIP_LANE_HEIGHT = 24;

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
    // getting-started re-pinned 3 -> 5 with #2366 C: narrower (0.8x Latin
    // width) and taller (2-line description) cards shift the grouped layout;
    // penetration/overlap invariants above are what must not regress.
    // Re-pinned 5 -> 4 and (team-ownership) 2 -> 0 with #2885: edges leaving
    // one source share one fan-out spine, so the corridors that each held one
    // edge, and the crossings between them, collapse into one.
    ["en/getting-started/index.krs", "team", 4],
    // Re-pinned 3 -> 2 and 7 -> 2 with #2610: the gutter side is chosen by
    // occupancy and length instead of right-first, so a detour whose
    // endpoints sit nearer the left takes the left gutter and crosses less.
    ["en/feature-samples/team-ownership.krs", "team", 0],
    ["en/feature-samples/boundary-clusters.krs", "boundary", 2],
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

describe("multi-system root view routes its edges (#2363)", () => {
  // A real bundled sample rather than an inline string: the #1954 lesson is that
  // a fence covering only hand-built fixtures misses what users actually draw.
  // `multi-system-root.krs` declares two systems, each with an actor that skips
  // the client tier, so a straight line for those edges crosses the client card
  // between the endpoints and the router has to route around it.
  const MODEL = "en/feature-samples/multi-system-root.krs";

  it("lays the two systems out side by side", () => {
    const res = layoutOf(MODEL);
    const shop = res.containers.find((c) => c.id === "Shop");
    const billing = res.containers.find((c) => c.id === "Billing");
    expect(shop, "Shop container").toBeDefined();
    expect(billing, "Billing container").toBeDefined();
    expect(shop!.x + shop!.width <= billing!.x || billing!.x + billing!.width <= shop!.x).toBe(
      true,
    );
  });

  it("the model actually exercises the router", () => {
    // Straight centre-to-centre on the same placement pierces, so the zero below
    // is the router's doing rather than a property of this particular layout.
    expect(straightCentrePenetrations(layoutOf(MODEL))).toBeGreaterThan(0);
    expect(
      layoutOf(MODEL).edges.filter((e) => (e.waypoints?.length ?? 0) > 0).length,
    ).toBeGreaterThan(0);
  });

  it("no edge pierces a node card", () => {
    expect(totalPenetrations(layoutOf(MODEL))).toBe(0);
  });

  it("no two edges share a collinear corridor", () => {
    const res = layoutOf(MODEL);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it("emits crossing marks, which the root view never did before", () => {
    // Not "there are marks" — an uncrossed layout legitimately has none. The
    // contract is that the field is populated rather than absent, so the marks
    // layer is reachable on this surface at all (TPL-1983: the same view state
    // must behave the same across surfaces).
    expect(layoutOf(MODEL).crossingMarks).toBeDefined();
  });

  it("keeps every system's routes inside its own strip, on either side (#2610)", () => {
    // Two systems whose fan-ins need both gutters: a left lane of the second
    // system must not run into the first system's right-side routes.
    const fan = (sys: string) => {
      const sources = ["A", "B", "C", "D", "E", "F"].map((id) => `  service ${sys}${id}`);
      const walls = ["W1", "W2", "W3"].map((id) => `  service ${sys}${id}`);
      const edges = ["A", "B", "C", "D", "E", "F"].map((id) => `  ${sys}${id} -> ${sys}Store`);
      const walled = ["A", "B", "C"].map((id) => `  ${sys}${id} -> ${sys}W1`);
      const body = [...sources, ...walls, `  database ${sys}Store`, ...edges, ...walled];
      return `system ${sys} {\n${body.join("\n")}\n}`;
    };
    const res = layoutOfSource(`${fan("Left")}\n${fan("Right")}`);
    const systems = res.containers.filter((c) => !c.group && !c.ghost).sort((a, b) => a.x - b.x);
    expect(systems).toHaveLength(2);
    expect(res.edges.some((e) => (e.waypoints?.length ?? 0) > 0)).toBe(true);
    // A system's strip is its container plus everything its edges reach — a
    // gutter route runs outside the container on either side. Strips must not
    // overlap, or one system's lanes would be drawn across the other's.
    const strips = systems.map((c) => {
      const inside = (id: string) => {
        const n = res.nodes.get(id)!;
        return n.x >= c.x && n.x + n.width <= c.x + c.width;
      };
      let min = c.x;
      let max = c.x + c.width;
      for (const e of res.edges) {
        if (e.ghost || e.cyclic || !inside(e.from)) continue;
        for (const p of pointsOf(e)) {
          min = Math.min(min, p.x);
          max = Math.max(max, p.x);
        }
      }
      return { min, max };
    });
    expect(strips[0].max).toBeLessThan(strips[1].min);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(totalPenetrations(res)).toBe(0);
  });

  it("routes each system against its own bounds, not the whole canvas", () => {
    // A canvas-wide gutter would send an edge inside the left system out past
    // the right one. Every point of a Shop-internal edge must stay left of the
    // Billing block.
    const res = layoutOf(MODEL);
    const billing = res.containers.find((c) => c.id === "Billing")!;
    const shopIds = new Set(["Shopper", "Ops", "Storefront", "Orders", "Catalog", "ShopDB"]);
    for (const e of res.edges) {
      if (!shopIds.has(e.from) || !shopIds.has(e.to)) continue;
      for (const p of pointsOf(e)) expect(p.x).toBeLessThan(billing.x);
    }
  });
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

/**
 * The direction a hop's arc bumps toward, read off how the renderer draws it:
 * the path is `M hop-halfWidth*(cos,sin) A r r angle 0 1 hop+halfWidth*(cos,sin)`,
 * and sweep-flag 1 advances the angle, so the crown lands 90 degrees on from the
 * start point — at `(sin, -cos)`. Named and fenced by `the crown direction
 * matches the drawn arc` below, because the sign is not something the corridor
 * fence can check for itself: the corridors that bound the radius are parallel
 * port fans, which are equally wide on both sides, so a flipped sign measures a
 * different side and gets the same number.
 */
function crownNormal(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

/**
 * For each hop, how far its arc's crown can rise before it lands on a line that
 * is *not* the one being hopped — the corridor the arc has to fit in.
 *
 * A ray cast from the hop centre along the crown normal, so it is monotone in
 * the radius: an arc of radius r reaches a neighbour exactly when r >= the
 * clearance. Counting "arcs that touch a neighbour at radius r" instead is not
 * monotone, because past a certain r the crown passes through the neighbour and
 * out the other side, and the count drops again.
 *
 * Band-widened arcs (`ry` set) are left out: they are deliberately taller than
 * the corridor so they escape the band they ride, which TPL-2631 ranks above
 * staying clear of a neighbour.
 */
function crownClearances(res: LayoutResult): number[] {
  const segs: { a: Point; b: Point; edge: number }[] = [];
  res.edges.forEach((e, i) => {
    const pts = pointsOf(e);
    for (let k = 1; k < pts.length; k++) segs.push({ a: pts[k - 1]!, b: pts[k]!, edge: i });
  });
  const out: number[] = [];
  for (const hop of res.crossingMarks?.hops ?? []) {
    if (hop.ry !== undefined) continue;
    const { x: nx, y: ny } = crownNormal(hop.angle);
    let best = Infinity;
    for (const seg of segs) {
      if (seg.edge === hop.edge) continue;
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      // Ray (hop + t*n) against segment (a + u*d): t >= 0 and 0 <= u <= 1.
      const den = nx * dy - ny * dx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((seg.a.x - hop.x) * dy - (seg.a.y - hop.y) * dx) / den;
      const u = ((seg.a.x - hop.x) * ny - (seg.a.y - hop.y) * nx) / den;
      // t <= 1 is the line being hopped, which runs through the hop centre.
      if (t <= 1 || u < 0 || u > 1) continue;
      if (t < best) best = t;
    }
    if (Number.isFinite(best)) out.push(best);
  }
  return out;
}

/**
 * A model that saturates both kinds of trunk (#2883, #2885).
 *
 * Fan-in: six services in six teams writing to one shared target, so the
 * trunk's spine carries two, three, four, five and finally six edges on its way
 * down. Three of those services also call an `[external]`, which sits on the
 * far side and is reached by a corridor numbered *beyond* every trunk spine — so
 * those stubs cross the band on their way out, which is the case a band can
 * hide (TPL-2631).
 *
 * Fan-out: one more service calls five targets, each in a team of its own and
 * each called by nobody else, so no fan-in trunk claims them. The target
 * placed in the band right below the source is reached directly; the other
 * four cross bands and take the gutter, where they leave the source on one
 * spine that sheds a branch per target row, so its count goes four, three,
 * two on the way down.
 *
 * No bundled example forms a fan-in trunk at all (`0 trunked in 0 trunks` in
 * every mode), and only small fan-outs, so without a fixture like this the
 * trunks' design sits outside the fence and every assertion about it is green
 * by accident of corpus (TPL-2598). Every node is a plain service, not a
 * `database`, so "on the outline" is exactly "on the rect" and the endpoint
 * check below is sharp.
 */
const FAN_IN = 6;
const CROSSERS = 3;
const FAN_OUT = 5;
const TRUNK_FIXTURE = `system Fan {
${Array.from({ length: FAN_IN }, (_s, i) => `  service S${i} { label "S${i}" }`).join("\n")}
${Array.from({ length: CROSSERS }, (_x, i) => `  service X${i} [external] { label "X${i}" }`).join("\n")}
  service Shared { label "Shared" }
  service F { label "F" }
${Array.from({ length: FAN_OUT }, (_g, i) => `  service G${i} { label "G${i}" }`).join("\n")}
${Array.from({ length: FAN_IN }, (_s, i) => `  S${i} -> Shared "write"`).join("\n")}
${Array.from({ length: CROSSERS }, (_x, i) => `  S${i + 1} -> X${i} "call"`).join("\n")}
${Array.from({ length: FAN_OUT }, (_g, i) => `  F -> G${i} "notify"`).join("\n")}
}
organization Org {
${Array.from({ length: FAN_IN }, (_s, i) => `  team "t${i}" { label "T${i}" owns S${i} }`).join("\n")}
  team "f" { label "F" owns F }
${Array.from({ length: FAN_OUT }, (_g, i) => `  team "g${i}" { label "G${i}" owns G${i} }`).join("\n")}
}`;

describe("fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)", () => {
  const laid = () => layoutOfSource(TRUNK_FIXTURE, "team");

  /** A trunk's siblings, keyed by `trunkId`. */
  const trunksOf = (res: LayoutResult) => {
    const byId = new Map<string, LayoutEdge[]>();
    for (const e of res.edges) {
      if (e.trunkId === undefined) continue;
      const list = byId.get(e.trunkId);
      if (list) list.push(e);
      else byId.set(e.trunkId, [e]);
    }
    return [...byId.values()];
  };

  it("the fixture actually builds a trunk deep enough to need counting", () => {
    const res = laid();
    const trunks = trunksOf(res);
    expect(trunks).toHaveLength(1);
    expect(trunks[0].length).toBeGreaterThanOrEqual(4);
    // And the spine carries different amounts along its length, which is the
    // thing a single number at the entry could not tell you.
    const counts = new Set(
      res.crossingMarks!.bands.filter((b) => res.edges[b.edge].trunkId).map((b) => b.count),
    );
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBe(trunks[0].length);
  });

  it("trunk siblings share one spine and one entry, and no other pair is collinear", () => {
    const res = laid();
    for (const siblings of trunksOf(res)) {
      const spineX = new Set(siblings.map((e) => e.waypoints![0].x));
      const entries = new Set(siblings.map((e) => `${e.toPoint.x},${e.toPoint.y}`));
      expect(spineX.size).toBe(1);
      expect(entries.size).toBe(1);
    }
    // Everything the exemption does not cover stays at zero, so the pairs it
    // skips are the ones named above and nothing else.
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it("each merge mark carries what the spine holds below it", () => {
    const res = laid();
    const { bands } = res.crossingMarks!;
    // The fan-out's marks count the other way; they have their own fence below.
    const junctions = res.crossingMarks!.junctions.filter(
      (j) => res.edges[j.edge].trunkId !== undefined,
    );
    expect(junctions.length).toBeGreaterThanOrEqual(3);
    // The shared entry every sibling ends on, which is the direction "onward"
    // means: a mark stands at a cut between two bands, and the one it speaks for
    // is the one on the target side.
    const entryY = res.edges.find((e) => e.trunkId !== undefined)!.toPoint.y;
    for (const mark of junctions) {
      const probe = mark.y + Math.sign(entryY - mark.y) * 0.5;
      const onward = bands.find((b) =>
        b.points.some((p, i) => {
          if (i === 0) return false;
          const a = b.points[i - 1];
          return (
            Math.abs(a.x - mark.x) < 1e-6 &&
            Math.abs(p.x - mark.x) < 1e-6 &&
            Math.min(a.y, p.y) < probe &&
            probe < Math.max(a.y, p.y)
          );
        }),
      );
      expect(onward, `no band past the mark (${mark.x}, ${mark.y})`).toBeDefined();
      expect(onward!.count).toBe(mark.count);
    }
  });

  it("a trunk edge's label sits on the stub only that edge owns", () => {
    const res = laid();
    for (const e of res.edges) {
      if (e.trunkId === undefined || !e.label) continue;
      const points = pointsOf(e);
      const { anchor } = labelAnchorWithSegment(points, 0.5, 0, 0, ownLabelSegment(e));
      // The stub runs from the source's port to the elbow on the spine. The
      // longest segment is the spine every sibling draws on, so the default
      // heuristic would put every label on a line that names none of them.
      const stubY = points[0].y;
      expect(anchor.y).toBeCloseTo(stubY, 6);
      expect(anchor.x).toBeGreaterThan(Math.min(points[0].x, points[1].x) - 1e-6);
      expect(anchor.x).toBeLessThan(Math.max(points[0].x, points[1].x) + 1e-6);
    }
  });

  it("an arc that rides a band arches clear of it (TPL-2631)", () => {
    const res = laid();
    const { hops, bands } = res.crossingMarks!;
    const onBand = hops.filter((hop) =>
      bands.some((band) =>
        band.points.some((p, i) => {
          if (i === 0) return false;
          const a = band.points[i - 1];
          const half = trunkBandHalfWidth(band.count);
          const vertical = Math.abs(a.x - p.x) < 1e-6;
          return vertical
            ? Math.abs(hop.x - a.x) <= half + 2 &&
                hop.y > Math.min(a.y, p.y) &&
                hop.y < Math.max(a.y, p.y)
            : Math.abs(hop.y - a.y) <= half + 2 &&
                hop.x > Math.min(a.x, p.x) &&
                hop.x < Math.max(a.x, p.x);
        }),
      ),
    );
    // The fixture exists to produce these: a crossing nobody can see reads as a
    // connection, which is the one thing the mark is for.
    expect(onBand.length).toBeGreaterThanOrEqual(1);
    for (const hop of onBand) {
      const half = Math.max(...bands.map((b) => trunkBandHalfWidth(b.count)));
      expect(hop.ry ?? HOP_RADIUS).toBeGreaterThan(half);
      expect(hop.halfWidth).toBeGreaterThan(half);
    }
  });

  it("no count mark covers a crossing", () => {
    const { junctions, hops } = laid().crossingMarks!;
    for (const mark of junctions) {
      for (const hop of hops) {
        const overlaps =
          Math.abs(hop.x - mark.x) < 9 + hop.halfWidth &&
          Math.abs(hop.y - mark.y) < 9 + (hop.ry ?? HOP_RADIUS) + 2;
        expect(overlaps, `count at (${mark.x}, ${mark.y}) sits on a hop`).toBe(false);
      }
    }
  });

  it("every endpoint stays on its node's outline (TPL-2385)", () => {
    // Moving a label must not move a port. Every node here is a rect, so the
    // drawn outline is the rect and this is exact.
    const res = laid();
    for (const e of res.edges) {
      for (const [id, p] of [
        [e.from, e.fromPoint],
        [e.to, e.toPoint],
      ] as const) {
        const n = res.nodes.get(id);
        if (!n) continue;
        const onVertical =
          (Math.abs(p.x - n.x) < 0.5 || Math.abs(p.x - (n.x + n.width)) < 0.5) &&
          p.y >= n.y - 0.5 &&
          p.y <= n.y + n.height + 0.5;
        const onHorizontal =
          (Math.abs(p.y - n.y) < 0.5 || Math.abs(p.y - (n.y + n.height)) < 0.5) &&
          p.x >= n.x - 0.5 &&
          p.x <= n.x + n.width + 0.5;
        expect(onVertical || onHorizontal, `${e.from}->${e.to} leaves ${id}`).toBe(true);
      }
    }
  });

  it("no lane spills into a card (TPL-1927 measures both axes together)", () => {
    expect(totalPenetrations(laid())).toBe(0);
  });

  it("an arc widened for a band is *drawn* as tall as it was widened (#2884)", () => {
    // The sibling of "an arc that rides a band arches clear of it" above, read
    // off the SVG instead of the mark. That one passed while the renderer wrote
    // the constant `HOP_RADIUS` as every arc's `ry` and dropped the height the
    // layout had computed, so a widened arc was drawn flat inside the band it
    // hops — the exact reading TPL-2631 exists to prevent, with a green fence
    // over it. A value the layout computes is only real once the drawing uses
    // it, so this one measures the drawing (TPL-2803).
    // Render the very layout the marks come from, so an arc can be matched to
    // its mark by coordinate. Going through `compile` would re-lay the model and
    // put the hops at slightly different points, leaving nothing to match on.
    const res = laid();
    const svg = renderFromLayout(res, stylesOfSource(TRUNK_FIXTURE));
    // Match each arc to the mark it was drawn from and compare heights, rather
    // than asking only that the height exceed the default radius: a renderer
    // that clamped every band-riding arc to `HOP_RADIUS + 1` would satisfy the
    // looser form while still drawing the arc inside a band 8.5px wide.
    const drawn = new Map<string, number>();
    for (const m of svg.matchAll(
      /M (-?[\d.]+) (-?[\d.]+) A ([\d.]+) ([\d.]+) (-?[\d.]+) 0 1 (-?[\d.]+) (-?[\d.]+)/g,
    )) {
      drawn.set(`${m[1]},${m[2]}`, Number(m[4]));
    }
    const round2 = (n: number) => Number(n.toFixed(2));
    const widened = res.crossingMarks!.hops.filter((hop) => hop.ry !== undefined);
    // The fixture exists to produce these; without one the loop below is
    // vacuous (TPL-2598).
    expect(widened.length).toBeGreaterThan(0);
    for (const hop of widened) {
      const rad = (hop.angle * Math.PI) / 180;
      const key = `${round2(hop.x - hop.halfWidth * Math.cos(rad))},${round2(
        hop.y - hop.halfWidth * Math.sin(rad),
      )}`;
      const ry = drawn.get(key);
      expect(ry, `no arc drawn at ${key} for the mark widened to ${hop.ry}`).toBeDefined();
      expect(ry, `mark asks for ry ${hop.ry}, drawing says ${ry}`).toBeCloseTo(hop.ry!, 2);
      // And the height it asks for is the one that clears the band.
      expect(hop.ry!).toBeGreaterThan(HOP_RADIUS);
    }
  });
});

describe("hop arc radius — corridor fence (#2884, TPL-2598)", () => {
  // One hub calling twelve targets, each target also read by its own service,
  // grouped by team. That crowds one card side with the widest port fan a
  // grouped view builds: `fanOutGutterPorts` spaces ports by side length over
  // count, so the corridor an arc has to fit in closes as the fan grows. This
  // is what bounds the radius — not `LANE_PITCH`, which the design measured at
  // 22px without moving the number.
  //
  // Only the grouped view is fenced. The design measured that raising the
  // radius costs the *ungrouped* view arcs that reach a neighbour on the most
  // crowded side of a 10k-line model, and took that cost knowingly; asserting a
  // clearance there would assert something the project decided against.
  const N = 12;
  const WIDE = `system Wide {
  service Hub { label "Hub" }
${Array.from({ length: N }, (_v, i) => `  service T${i} { label "T${i}" }`).join("\n")}
${Array.from({ length: N }, (_v, i) => `  service U${i} { label "U${i}" }`).join("\n")}
${Array.from({ length: N }, (_v, i) => `  Hub -> T${i} "call"`).join("\n")}
${Array.from({ length: N }, (_v, i) => `  U${i} -> T${(i + 2) % N} "read"`).join("\n")}
}
organization Org {
${Array.from({ length: N }, (_v, i) => `  team "t${i}" { label "T${i}" owns T${i} owns U${i} }`).join("\n")}
  team "hub" { label "Hub" owns Hub }
}`;

  it("the crown direction matches the drawn arc", () => {
    // `crownClearances` measures along `crownNormal`, so if that points the wrong
    // way the corridor fence certifies the side the arc does not occupy — and it
    // does so silently, because a port fan is as wide on one side as the other.
    // Re-derive the direction from the emitted path instead of restating the
    // formula: centre at the midpoint of the endpoints, then 90 degrees on from
    // the start in the direction the sweep flag advances (TPL-2803).
    const svg = renderFromLayout(layoutOfSource(WIDE, "team"), stylesOfSource(WIDE));
    const arcs = [
      ...svg.matchAll(
        /M (-?[\d.]+) (-?[\d.]+) A ([\d.]+) ([\d.]+) (-?[\d.]+) 0 1 (-?[\d.]+) (-?[\d.]+)/g,
      ),
    ].map(
      (m) => m.slice(1).map(Number) as [number, number, number, number, number, number, number],
    );
    const circular = arcs.filter(([, , rx, ry]) => Math.abs(rx - ry) < 1e-6);
    expect(circular.length).toBeGreaterThan(10);
    for (const [x0, y0, rx, , rot, x1, y1] of circular) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const start = Math.atan2(y0 - cy, x0 - cx);
      const drawn = { x: Math.cos(start + Math.PI / 2), y: Math.sin(start + Math.PI / 2) };
      const ours = crownNormal(rot);
      expect(drawn.x, `arc at ${rot} deg bumps x`).toBeCloseTo(ours.x, 2);
      expect(drawn.y, `arc at ${rot} deg bumps y`).toBeCloseTo(ours.y, 2);
      // And the radius really is the thing that carries the arc off the line.
      expect(rx).toBeGreaterThan(0);
    }
  });

  it("the default radius fits the tightest corridor, and the corpus reaches that limit", () => {
    const clearances = crownClearances(layoutOfSource(WIDE, "team"));
    expect(clearances.length).toBeGreaterThan(20);
    const tightest = Math.min(...clearances);
    // Arcs fit today.
    expect(tightest, `tightest corridor ${tightest.toFixed(1)}px`).toBeGreaterThan(HOP_RADIUS);
    // And the corridor is no wider than 7px, so a raise to 7 cannot fit it.
    // That is the boundary `docs/acceptance/2884-hop-arc-radius.md` claims, and
    // the looser bound this started with (9px, the tip-sized radius the design
    // rejected) did not hold it: a fixture that drifted to an 8px corridor would
    // have satisfied both assertions while radius 7 passed, making the record
    // false (TPL-2598). Pinned against 7 rather than against `HOP_RADIUS` so
    // that *lowering* the radius does not trip it: the claim is about what the
    // fixture reaches, not about the current radius.
    expect(tightest).toBeLessThanOrEqual(7);
  });
});

describe("fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)", () => {
  const laid = () => layoutOfSource(TRUNK_FIXTURE, "team");
  const siblingsOf = (res: LayoutResult) => res.edges.filter((e) => e.outTrunkId === "F");
  /** Where the spine leaves the source: the row every sibling shares. */
  const exitY = (res: LayoutResult) => siblingsOf(res)[0].waypoints![0].y;

  it("the fixture actually builds a fan-out trunk deep enough to need counting", () => {
    const res = laid();
    const siblings = siblingsOf(res);
    // One target sits in the next band down and is reached directly; the rest
    // cross bands, which is what reaches the gutter.
    expect(siblings.length).toBeGreaterThanOrEqual(4);
    // No fan-in trunk claimed them: each target is called by F alone.
    for (const e of siblings) expect(e.trunkId).toBeUndefined();
    const counts = new Set(
      res.crossingMarks!.bands.filter((b) => res.edges[b.edge].outTrunkId).map((b) => b.count),
    );
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBe(siblings.length);
  });

  it("siblings share one exit and one spine, and no other pair is collinear", () => {
    const res = laid();
    const siblings = siblingsOf(res);
    expect(new Set(siblings.map((e) => `${e.fromPoint.x},${e.fromPoint.y}`)).size).toBe(1);
    expect(new Set(siblings.map((e) => e.waypoints![0].x)).size).toBe(1);
    // Each leaves at its own target's row.
    expect(new Set(siblings.map((e) => e.toPoint.y)).size).toBe(siblings.length);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it("its spine sits beyond every fan-in spine, so the two kinds never share an x", () => {
    const res = laid();
    const inXs = res.edges.filter((e) => e.trunkId).map((e) => e.waypoints![0].x);
    const outX = siblingsOf(res)[0].waypoints![0].x;
    expect(inXs.length).toBeGreaterThanOrEqual(2);
    expect(outX).toBeGreaterThan(Math.max(...inXs));
  });

  it("the count descends along the spine, and each matches the band it stands beside", () => {
    const res = laid();
    const { bands } = res.crossingMarks!;
    const from = exitY(res);
    const marks = res
      .crossingMarks!.junctions.filter((j) => res.edges[j.edge].outTrunkId === "F")
      .sort((a, b) => Math.abs(a.y - from) - Math.abs(b.y - from));
    // A split at every branch but the farthest, which is just the spine's end.
    const n = siblingsOf(res).length;
    expect(marks.map((m) => m.count)).toEqual(Array.from({ length: n - 1 }, (_m, i) => n - i));
    for (const mark of marks) {
      // The number is what the spine carries between the mark and the source,
      // which is the band on the source side of it.
      const probe = mark.y + Math.sign(from - mark.y) * 0.5;
      const band = bands.find((b) =>
        b.points.some((p, i) => {
          if (i === 0) return false;
          const a = b.points[i - 1];
          return (
            Math.abs(a.x - p.x) < 1e-6 &&
            Math.abs(a.x - mark.x) < 1e-6 &&
            Math.min(a.y, p.y) < probe &&
            probe < Math.max(a.y, p.y)
          );
        }),
      );
      expect(band, `no band before the mark (${mark.x}, ${mark.y})`).toBeDefined();
      expect(band!.count).toBe(mark.count);
    }
  });

  it("the band starts at the source's exit and runs the way the edges travel", () => {
    const res = laid();
    const exit = siblingsOf(res)[0].fromPoint;
    const widest = res.crossingMarks!.bands.find(
      (b) => res.edges[b.edge].outTrunkId === "F" && b.count === siblingsOf(res).length,
    )!;
    expect(widest.points[0]).toEqual(exit);
  });

  it("a fan-out edge's label sits on the branch only that edge owns", () => {
    const res = laid();
    for (const e of siblingsOf(res)) {
      const points = pointsOf(e);
      const { anchor } = labelAnchorWithSegment(points, 0.5, 0, 0, ownLabelSegment(e));
      // The branch runs from the elbow on the spine into the edge's target; the
      // exit and the spine are drawn by every sibling.
      const last = points.length - 1;
      expect(anchor.y).toBeCloseTo(points[last].y, 6);
      expect(anchor.x).toBeGreaterThan(Math.min(points[last - 1].x, points[last].x) - 1e-6);
      expect(anchor.x).toBeLessThan(Math.max(points[last - 1].x, points[last].x) + 1e-6);
    }
  });

  it("no count mark covers a crossing, and an arc on a band clears it (TPL-2631)", () => {
    const { junctions, hops, bands } = laid().crossingMarks!;
    for (const mark of junctions) {
      for (const hop of hops) {
        const overlaps =
          Math.abs(hop.x - mark.x) < 9 + hop.halfWidth &&
          Math.abs(hop.y - mark.y) < 9 + (hop.ry ?? HOP_RADIUS) + 2;
        expect(overlaps, `count at (${mark.x}, ${mark.y}) sits on a hop`).toBe(false);
      }
    }
    const widest = Math.max(...bands.map((b) => trunkBandHalfWidth(b.count)));
    for (const hop of hops) {
      if (hop.ry === undefined) continue;
      expect(hop.ry).toBeGreaterThan(trunkBandHalfWidth(2));
      expect(hop.ry).toBeLessThanOrEqual(widest + 3);
    }
  });

  it("every endpoint stays on its node's outline, and no lane spills into a card (TPL-2385 / TPL-1927)", () => {
    const res = laid();
    for (const e of siblingsOf(res)) {
      for (const [id, p] of [
        [e.from, e.fromPoint],
        [e.to, e.toPoint],
      ] as const) {
        const n = res.nodes.get(id)!;
        const onVertical =
          (Math.abs(p.x - n.x) < 0.5 || Math.abs(p.x - (n.x + n.width)) < 0.5) &&
          p.y >= n.y - 0.5 &&
          p.y <= n.y + n.height + 0.5;
        expect(onVertical, `${e.from}->${e.to} leaves ${id}`).toBe(true);
      }
    }
    expect(totalPenetrations(res)).toBe(0);
  });

  it("does not form where the out-edges have different sources, and leaves that model untouched", () => {
    // The same targets, each called by a source of its own: nothing shares an
    // exit, so the pass must not move a pixel.
    const split = `system Fan {
${Array.from({ length: FAN_OUT }, (_g, i) => `  service F${i} { label "F${i}" }\n  service G${i} { label "G${i}" }`).join("\n")}
${Array.from({ length: FAN_OUT }, (_g, i) => `  F${i} -> G${(i + 1) % FAN_OUT} "notify"`).join("\n")}
}
organization Org {
${Array.from({ length: FAN_OUT }, (_g, i) => `  team "g${i}" { label "G${i}" owns F${i} owns G${i} }`).join("\n")}
}`;
    const res = layoutOfSource(split, "team");
    expect(res.edges.some((e) => e.outTrunkId !== undefined)).toBe(false);
    expect(res.crossingMarks!.bands).toHaveLength(0);
  });

  it("gives the same geometry twice", () => {
    const a = laid();
    const b = laid();
    expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
    expect(JSON.stringify(a.crossingMarks)).toBe(JSON.stringify(b.crossingMarks));
  });
});

describe("crowded inter-row channel — capacity fence (#2608, TPL-2598)", () => {
  // Ten services fanning into three shared targets. Every one of the thirty
  // edges is a skip-layer edge that has to traverse the *same* inter-row
  // channel above the target row, so the channel carries thirty horizontal
  // runs at once. The bundled examples never crowd a channel like this, which
  // is why their overlap fence stayed green while a real 10k-line model showed
  // hundreds of collinear pairs (TPL-2598: a fence on a finite resource needs
  // an input that saturates it).
  //
  // The targets are plain services rather than `database` nodes so that the
  // channel is the only finite resource in play: a cylinder's inset outline
  // clamps fanned-out ports onto one point, which is the port-sharing class
  // #2631 owns, not the channel-capacity one this fence is for.
  const services = Array.from(
    { length: 10 },
    (_s, i) => `  service S${i} { label "Service ${i}" }`,
  );
  const targets = Array.from({ length: 3 }, (_t, i) => `  service T${i} { label "Target ${i}" }`);
  const edges = services.flatMap((_s, i) => targets.map((_t, j) => `  S${i} -> T${j}`));
  const CROWDED = `system Crowded {\n${[...services, ...targets, ...edges].join("\n")}\n}`;

  it("the fixture actually crowds a channel", () => {
    // All thirty edges survive, most are routed, and one inter-row channel
    // carries more runs than the sub-row gap holds at one lane per
    // `LANE_PITCH` (60 / 14 → four) — the saturation the fence is for.
    const res = layoutOfSource(CROWDED);
    expect(res.edges).toHaveLength(30);
    const routed = res.edges.filter((e) => (e.waypoints?.length ?? 0) > 0);
    expect(routed.length).toBeGreaterThanOrEqual(20);
    const frames = res.containers.filter((c) => c.group).flatMap((c) => c.coverage ?? [c]);
    const busiest = Math.max(
      ...collectChannels(res.nodes, res.edges, frames).map((c) => c.runs.length),
    );
    expect(busiest).toBeGreaterThanOrEqual(5);
  });

  it("no two horizontal runs share a collinear channel lane", () => {
    expect(collinearOverlaps(layoutOfSource(CROWDED), "h")).toBe(0);
  });

  it("no two vertical runs share a collinear corridor", () => {
    expect(collinearOverlaps(layoutOfSource(CROWDED), "v")).toBe(0);
  });

  it("no lane spills into a card (TPL-1927 measures both axes together)", () => {
    expect(totalPenetrations(layoutOfSource(CROWDED))).toBe(0);
  });

  it("reserves the right row when a whole row moved to the side columns", () => {
    // Two hubs consuming externals put the externals in side columns (ADR-1728),
    // which empties their row: the reservation must key on the rows that are
    // still there, not on the empty one, and the crowded channel still opens.
    const many = Array.from({ length: 12 }, (_s, i) => `  service S${i} { label "Service ${i}" }`);
    const four = Array.from({ length: 4 }, (_t, i) => `  service T${i} { label "Target ${i}" }`);
    const fan = many.flatMap((_s, i) => four.map((_t, j) => `  S${i} -> T${j}`));
    const externals = [
      `  service E1 [external] { label "External 1" }`,
      `  service E2 [external] { label "External 2" }`,
      `  S0 -> E1`,
      `  S3 -> E2`,
    ];
    const src = `system Crowded {\n${[...many, ...four, ...externals, ...fan].join("\n")}\n}`;
    const res = layoutOfSource(src);
    const inner = [...res.nodes.values()].filter(
      (n) => n.id.startsWith("S") || n.id.startsWith("T"),
    );
    const left = Math.min(...inner.map((n) => n.x));
    const right = Math.max(...inner.map((n) => n.x + n.width));
    for (const id of ["E1", "E2"]) {
      const e = res.nodes.get(id)!;
      expect(e.x + e.width <= left || e.x >= right).toBe(true);
    }
    expect(res.placementPasses).toBe(2);
    // The room opened above the target row, not above the empty externals
    // row: the gap between the last service row and the targets is wider
    // than the default layer gap.
    const targetRow = inner.filter((n) => n.id.startsWith("T"));
    const targetTop = Math.min(...targetRow.map((n) => n.y));
    const above = inner.filter((n) => n.y + n.height <= targetTop);
    const aboveBottom = Math.max(...above.map((n) => n.y + n.height));
    expect(targetTop - aboveBottom).toBeGreaterThan(120);
    expect(totalPenetrations(res)).toBe(0);
  });
});

describe("deploy view routes through the shared chain (#2609, TPL-219)", () => {
  // Bundled models whose deploy block carries at least one edge between
  // containers. The deploy view never ran the chain until #2609: each edge
  // went centre-to-centre and an edge into a container landed on one point.
  const DEPLOY_MODELS = [
    "en/getting-started/index.krs",
    "en/payment-platform/system.krs",
    "en/deploy/system.krs",
  ] as const;

  function deployLayoutOf(file: string): LayoutResult {
    const krsFile = Parser.parse(readFileSync(resolve(EXAMPLES, file), "utf8")).value;
    return layoutDeploy(extractDeployView(krsFile.deploys, krsFile.systems));
  }

  // Deploy edges carry `ghost` as a *style* (they render in the muted group).
  // The shared metrics skip ghost edges, as the routing passes do, so measure
  // them with the style flag cleared rather than through a second metric.
  function routed(res: LayoutResult): LayoutResult {
    return { ...res, edges: res.edges.map((e) => ({ ...e, ghost: false })) };
  }

  /** Penetrations of the containers an edge does not terminate on. */
  function containerPenetrations(res: LayoutResult): number {
    const boxes = res.containers.filter((c) => !c.ghost);
    let total = 0;
    for (const e of res.edges) {
      const obstacles = boxes.filter((c) => c.id !== e.from && c.id !== e.to);
      total += countPolylinePenetrations(pointsOf(e), obstacles);
    }
    return total;
  }

  it.each(DEPLOY_MODELS)("%s: the deploy view has edges to route", (file) => {
    expect(deployLayoutOf(file).edges.length).toBeGreaterThan(0);
  });

  it.each(DEPLOY_MODELS)("%s: no edge pierces a container it does not terminate on", (file) => {
    expect(containerPenetrations(deployLayoutOf(file))).toBe(0);
  });

  it.each(DEPLOY_MODELS)("%s: no two edges share a collinear corridor", (file) => {
    const res = routed(deployLayoutOf(file));
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it.each(DEPLOY_MODELS)("%s: no two edges share an endpoint", (file) => {
    const res = deployLayoutOf(file);
    const key = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    const starts = res.edges.map((e) => key(e.fromPoint));
    const ends = res.edges.map((e) => key(e.toPoint));
    expect(new Set(starts).size).toBe(starts.length);
    expect(new Set(ends).size).toBe(ends.length);
  });
});

describe("exhausted interior corridors — column fence (#2611, TPL-2598)", () => {
  // The channel fence above saturates a *horizontal* resource; this one
  // saturates the vertical resource next to it. Eight sources fan into three
  // shared targets across a mid layer whose cards cover the columns beside
  // the sources, so every S→T edge needs a column between cards that a
  // sibling is not standing in. The bundled models never run out of columns —
  // which is why their overlap fence stayed green while a 10k-line model
  // showed thousands of collinear pairs (TPL-2598: a fence on a finite
  // resource needs an input that saturates it).
  const services = Array.from({ length: 8 }, (_s, i) => `  service S${i} { label "Service ${i}" }`);
  const mid = Array.from({ length: 5 }, (_m, i) => `  service M${i} { label "Mid ${i}" }`);
  const targets = Array.from({ length: 3 }, (_t, i) => `  service T${i} { label "Target ${i}" }`);
  const edges = [
    ...services.flatMap((_s, i) => targets.map((_t, j) => `  S${i} -> T${j}`)),
    ...mid.map((_m, i) => `  S${i} -> M${i}`),
    ...mid.map((_m, i) => `  M${i} -> T${i % 3}`),
  ];
  const CROWDED = `system Crowded {\n${[...services, ...mid, ...targets, ...edges].join("\n")}\n}`;

  it("the fixture actually runs the columns out", () => {
    // More long edges than the rows between them have gaps: with 34 edges over
    // three rows, the interior cannot hold them all on the gaps the cards
    // happen to leave, which is the state the reservation answers.
    const res = layoutOfSource(CROWDED);
    expect(res.edges).toHaveLength(34);
    const routed = res.edges.filter((e) => (e.waypoints?.length ?? 0) > 0);
    expect(routed.length).toBeGreaterThanOrEqual(25);
    expect(res.placementPasses).toBe(2);
  });

  it("no two edges share a collinear corridor on either axis", () => {
    const res = layoutOfSource(CROWDED);
    expect(collinearOverlaps(res, "v")).toBe(0);
    expect(collinearOverlaps(res, "h")).toBe(0);
  });

  it("no column spills into a card (TPL-1927 measures both axes together)", () => {
    expect(totalPenetrations(layoutOfSource(CROWDED))).toBe(0);
  });

  it("re-places at most once (ADR-2598's bound holds on the other axis)", () => {
    expect(layoutOfSource(CROWDED).placementPasses).toBeLessThanOrEqual(2);
  });

  it("gives the same canvas twice — the reservation is deterministic", () => {
    const once = layoutOfSource(CROWDED);
    const twice = layoutOfSource(CROWDED);
    expect([twice.width, twice.height]).toEqual([once.width, once.height]);
    expect(twice.edges.map((e) => pointsOf(e))).toEqual(once.edges.map((e) => pointsOf(e)));
    expect([...twice.nodes.values()].map((n) => [n.id, n.x, n.y])).toEqual(
      [...once.nodes.values()].map((n) => [n.id, n.x, n.y]),
    );
  });
});

/**
 * The measures above are taken with a flat scan over the whole obstacle set,
 * while the router now decides with the spatial index (#2790). The two have to
 * be the same measure, or a penetration could be zero on the fence's reckoning
 * and non-zero on the router's — TPL-1927's dual metric would then be measuring
 * a diagram the chain never saw.
 *
 * So, edge for edge on the real models: the boolean the router decides with
 * (`ObstacleQuery.polylineClear`) equals `countPolylinePenetrations(...) === 0`,
 * the counter these fences assert on. Probed both on each edge's actual route
 * (where the answer must be "clear", which is what penetration == 0 means) and
 * on the straight centre-to-centre line for the same edge, which pierces on
 * these models and so supplies the "not clear" half.
 */
describe("the obstacle index measures what the fences measure (#2790, TPL-1927)", () => {
  /** The grouped models the fences above pin, so frames take part in the exemption too. */
  const GROUPED_MODELS: [string, GroupBy][] = [
    ["en/getting-started/index.krs", "team"],
    ["en/feature-samples/team-ownership.krs", "team"],
    ["en/feature-samples/boundary-clusters.krs", "boundary"],
    ["en/feature-samples/boundary-multi-membership.krs", "boundary"],
  ];

  /**
   * Probes one layout: how many edges were checked, and how many of those the
   * counter called blocked. A disagreement fails inline rather than being
   * counted, so a returned pair always describes agreeing probes.
   */
  function indexVsCounter(res: LayoutResult): { checked: number; blocked: number } {
    const frames = framesOf(res);
    const nodes = [...res.nodes.values()];
    const index = ObstacleIndex.build(
      nodes,
      res.containers.filter((c) => c.group),
    );
    const centre = (n: LayoutNode): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
    let checked = 0;
    let blocked = 0;
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
      const query = index.forEdge(e.from, e.to);
      for (const path of [pointsOf(e), [centre(from), centre(to)]]) {
        const counted = countPolylinePenetrations(path, obstacles) === 0;
        expect(query.polylineClear(path), `${e.from} -> ${e.to}`).toBe(counted);
        checked++;
        if (!counted) blocked++;
      }
    }
    return { checked, blocked };
  }

  it.each(UNGROUPED_MODELS)("%s: the router's decision equals the counter", (file) => {
    expect(indexVsCounter(layoutOf(file)).checked).toBeGreaterThan(0);
  });

  it.each(GROUPED_MODELS)(
    "%s (group by %s): the router's decision equals the counter",
    (file, groupBy) => {
      expect(indexVsCounter(layoutOf(file, groupBy)).checked).toBeGreaterThan(0);
    },
  );

  it("the probes include blocked ones, so the agreement is not vacuous", () => {
    // A suite in which every probe is clear would agree trivially. The straight
    // centre-to-centre lines pierce on these models, which is the whole reason
    // the router exists.
    const blocked = [...UNGROUPED_MODELS].reduce(
      (sum, file) => sum + indexVsCounter(layoutOf(file)).blocked,
      0,
    );
    expect(blocked).toBeGreaterThan(0);
  });

  it("the grouped probes include blocked ones too, so the frames are load-bearing", () => {
    // The grouped models are here because frames take part in the exemption.
    // Counting them separately means an empty frame set cannot leave these
    // cases agreeing on nothing while the ungrouped total carries the guard.
    const blocked = GROUPED_MODELS.reduce(
      (sum, [file, groupBy]) => sum + indexVsCounter(layoutOf(file, groupBy)).blocked,
      0,
    );
    expect(blocked).toBeGreaterThan(0);
  });
});
