/**
 * The ghost band's edges routed through the routing chain (#2823 slice B, #3881).
 *
 * The band's edges are routed in a second phase, around the canvas's own routes
 * (`BAND_PHASE`): the canvas is laid out and routed exactly as it would be
 * without them, and the band's lines take what is left. These fences run on the
 * band fixtures that reach the limit (TPL-2598) and fail on the slice A tree,
 * where every band edge was a straight line the chain skipped.
 */
import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import "./shapes.js";
import { extractEntityView } from "../view/entity-relations.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { countPolylinePenetrations, type Point } from "./edge-geometry.js";
import { frameTitleBox } from "./band-routing.js";
import { LANE_PITCH } from "./edge-routing-lanes.js";
import type { LayoutEdge, LayoutResult, Rect } from "./layout-types.js";
import type { ViewSlice } from "../view/view-slice.js";
import { entityFixture, orderingFixture, serviceFixture } from "./fixtures/ghost-band.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { collectModelWarnings } from "../resolver/model-warnings.js";
import { edgeLineKeyOf, resolvedEdgeStyle } from "./edge-line-key.js";
import { drawnLabelBoxesOf, withheldLabelsOf } from "./edge-layer.js";
import { resolvePalette } from "./palette.js";
import { buildLabelInputs, labelBox, resolveLabelPlacements } from "./label-placement.js";
import { frameBordersOf } from "./container-frame.js";

function parse(src: string) {
  const parsed = Parser.parse(src);
  expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return parsed.value;
}

const stylesOf = new WeakMap<object, ReturnType<typeof resolveStyles>>();

/** Laid out the way `compile` lays a view out: styles, shapes and the pair key. */
function optionsOf(krsFile: ReturnType<typeof parse>) {
  const sheets = [getBuiltinStyleSheet()];
  collectModelWarnings(krsFile, sheets);
  const styles = resolveStyles(krsFile.systems, sheets);
  const palette = resolvePalette(undefined);
  stylesOf.set(krsFile, styles);
  return {
    ownerIndex: krsFile.ownerIndex,
    layoutHints: styles.layoutHints,
    edgeDirections: new Map(),
    edgeLineKey: edgeLineKeyOf(styles, undefined),
    withheldLabels: (r: LayoutResult) => withheldLabelsOf(r, styles, palette),
    canvasLabelBoxes: (r: LayoutResult) => drawnLabelBoxesOf(r, styles, palette),
    shapeForNode: (id: string) => {
      const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
      return typeof style.shape === "string" ? style.shape : style.shape.url;
    },
  };
}

function layoutOf(
  src: string,
  extract: (systems: ReturnType<typeof parse>["systems"]) => ViewSlice,
) {
  const krsFile = parse(src);
  const slice = extract(krsFile.systems);
  const options = optionsOf(krsFile);
  const res = layout(slice, options);
  const keys = [
    ...slice.ghostEntities.map((g) => g.key),
    ...slice.ghostDomains.map((g) => g.node.id),
  ];
  bandKeys.set(res, new Set(keys));
  return { slice, res, options, styles: stylesOf.get(krsFile)! };
}

/** The band's ghost keys per laid-out result. */
const bandKeys = new WeakMap<LayoutResult, Set<string>>();

const pointsOf = (e: LayoutEdge): Point[] => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
const inside = (r: Rect, f: Rect) =>
  r.x >= f.x && r.y >= f.y && r.x + r.width <= f.x + f.width && r.y + r.height <= f.y + f.height;
/**
 * The band's edges, told by their ends rather than by `band` alone, so a fence
 * also measures the slice A tree, where no edge carried the marker.
 */
const bandEdges = (res: LayoutResult) => {
  const keys = bandKeys.get(res) ?? new Set<string>();
  return res.edges.filter(
    (e) => e.band === true || (e.ghost === true && (keys.has(e.from) || keys.has(e.to))),
  );
};
const focusOf = (res: LayoutResult) =>
  res.containers.find((c) => !c.ghost && c.ghostBand === undefined)!;

/** Per band edge: the cards and the band frames it crosses that hold neither of its ends. */
function bandPenetrations(res: LayoutResult): string[] {
  const nodes = [...res.nodes.values()];
  const frames = res.containers.filter((c) => c.ghostBand !== undefined);
  return bandEdges(res).flatMap((e) => {
    const ends = [res.nodes.get(e.from)!, res.nodes.get(e.to)!];
    const cards = nodes.filter((n) => n.id !== e.from && n.id !== e.to);
    const others = frames.filter((f) => !ends.some((n) => inside(n, f)));
    const n = countPolylinePenetrations(pointsOf(e), [...cards, ...others]);
    return n > 0 ? [`${e.from}->${e.to}: ${n}`] : [];
  });
}

/** Axis-parallel stretches two edges share, at least one of them a band edge. */
function collinearWithBand(res: LayoutResult): string[] {
  const band = new Set(bandEdges(res));
  type Seg = { edge: LayoutEdge; axis: "v" | "h"; at: number; lo: number; hi: number };
  const segs: Seg[] = [];
  for (const edge of res.edges) {
    if (edge.cyclic || (edge.ghost && !band.has(edge))) continue;
    const pts = pointsOf(edge);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6)
        segs.push({ edge, axis: "v", at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      else if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6)
        segs.push({ edge, axis: "h", at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    }
  }
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = [segs[i], segs[j]];
      if (a.edge === b.edge || (!band.has(a.edge) && !band.has(b.edge))) continue;
      // A lane bundle and a mutual pair draw one line on purpose.
      if (a.edge.trunkId !== undefined && a.edge.trunkId === b.edge.trunkId) continue;
      if (a.edge.outTrunkId !== undefined && a.edge.outTrunkId === b.edge.outTrunkId) continue;
      if (a.edge.from === b.edge.to && a.edge.to === b.edge.from) continue;
      if (a.axis !== b.axis || Math.abs(a.at - b.at) > 1e-6) continue;
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 1e-6)
        out.push(`${a.edge.from}->${a.edge.to} / ${b.edge.from}->${b.edge.to}`);
    }
  }
  return out;
}

/** Strict-interior crossing points of two polylines. */
function properCrossings(p: Point[], q: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    for (let k = 0; k + 1 < q.length; k++) {
      const [a, b, c, d] = [p[i], p[i + 1], q[k], q[k + 1]];
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6)
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

for (const [name, src, extract] of [
  [
    "entity view",
    entityFixture(),
    (s: ReturnType<typeof parse>["systems"]) => extractEntityView(s, ["Shop", "Core", "Hub"]),
  ],
  [
    "service view",
    serviceFixture(),
    (s: ReturnType<typeof parse>["systems"]) => extractView(s, ["Shop", "Core"]),
  ],
] as const) {
  describe(`ghost band routing on the ${name} (#3881)`, () => {
    const { slice, res, options } = layoutOf(src, extract);

    it("routes the band's edges through the chain", () => {
      expect(bandEdges(res).length).toBeGreaterThan(0);
      expect(bandEdges(res).some((e) => (e.waypoints?.length ?? 0) > 0)).toBe(true);
    });

    it("crosses no card and no band frame that holds neither end", () => {
      expect(bandPenetrations(res)).toEqual([]);
    });

    it("shares no stretch of line with another edge", () => {
      expect(collinearWithBand(res)).toEqual([]);
    });

    it("runs along no frame border", () => {
      // A muted band line laid a few pixels inside a frame border reads as the border.
      const borders = res.containers
        .filter((c) => c.group !== true)
        .flatMap((c) => [
          { v: true, at: c.x, lo: c.y, hi: c.y + c.height, id: c.id },
          { v: true, at: c.x + c.width, lo: c.y, hi: c.y + c.height, id: c.id },
          { v: false, at: c.y, lo: c.x, hi: c.x + c.width, id: c.id },
          { v: false, at: c.y + c.height, lo: c.x, hi: c.x + c.width, id: c.id },
        ]);
      const hugging = bandEdges(res).flatMap((e) => {
        const pts = pointsOf(e);
        return pts.slice(0, -1).flatMap((a, i) => {
          const b = pts[i + 1];
          const v = Math.abs(a.x - b.x) < 1e-6;
          if (!v && Math.abs(a.y - b.y) > 1e-6) return [];
          const at = v ? a.x : a.y;
          const [lo, hi] = v
            ? [Math.min(a.y, b.y), Math.max(a.y, b.y)]
            : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
          return borders
            .filter(
              (f) =>
                f.v === v &&
                Math.abs(f.at - at) < 6 &&
                Math.min(hi, f.hi) - Math.max(lo, f.lo) > 20,
            )
            .map((f) => `${e.from}->${e.to} along ${f.id}`);
        });
      });
      expect(hugging).toEqual([]);
    });

    it("crosses no frame title", () => {
      const titles = res.containers.filter((c) => c.ghostBand === undefined).map(frameTitleBox);
      const crossing = bandEdges(res).filter(
        (e) => countPolylinePenetrations(pointsOf(e), titles) > 0,
      );
      expect(crossing.map((e) => `${e.from}->${e.to}`)).toEqual([]);
    });

    it("marks every crossing it is part of with a hop", () => {
      const band = new Set(bandEdges(res));
      const lines = res.edges.filter((e) => !e.cyclic && !(e.ghost && !band.has(e)));
      const hops = res.crossingMarks?.hops ?? [];
      const crossings: { at: Point; pair: string }[] = [];
      lines.forEach((a, i) => {
        for (const b of lines.slice(i + 1)) {
          if (!band.has(a) && !band.has(b)) continue;
          if (a.trunkId !== undefined && a.trunkId === b.trunkId) continue;
          if (a.outTrunkId !== undefined && a.outTrunkId === b.outTrunkId) continue;
          for (const at of properCrossings(pointsOf(a), pointsOf(b)))
            crossings.push({ at, pair: `${a.from}->${a.to} x ${b.from}->${b.to}` });
        }
      });
      expect(crossings.length).toBeGreaterThan(0);
      const bare = crossings.filter(
        ({ at }) => !hops.some((h) => Math.hypot(h.x - at.x, h.y - at.y) <= h.halfWidth + 1),
      );
      expect(bare.map((c) => c.pair)).toEqual([]);
    });

    it("leaves the canvas's own frame and routes as they are without the band's edges", () => {
      const without = layout({ ...slice, ghostEntityEdges: [], ghostDomainEdges: [] }, options);
      const rel = (r: LayoutResult) => {
        const f = focusOf(r);
        const at = (p: Point) => [+(p.x - f.x).toFixed(2), +(p.y - f.y).toFixed(2)];
        return {
          focus: [f.width, f.height],
          routes: r.edges.filter((e) => !e.ghost).map((e) => pointsOf(e).map(at)),
        };
      };
      expect(rel(res)).toEqual(rel(without));
    });
  });
}

describe("ghost band routing: lanes and pairs (#3881)", () => {
  const { res } = layoutOf(entityFixture(), (s) => extractEntityView(s, ["Shop", "Core", "Hub"]));

  it("spaces the runs between the focus frame and the band at least LANE_PITCH apart", () => {
    const f = focusOf(res);
    const outsideFocus = (y: number) => y < f.y || y > f.y + f.height;
    const runs = bandEdges(res).flatMap((e) => {
      const pts = pointsOf(e);
      return pts.slice(0, -1).flatMap((a, i) => {
        const b = pts[i + 1];
        return Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6 && outsideFocus(a.y)
          ? [{ e, y: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }]
          : [];
      });
    });
    expect(runs.length).toBeGreaterThan(0);
    const tight = runs.flatMap((a, i) =>
      runs
        .slice(i + 1)
        .filter(
          (b) =>
            a.e !== b.e &&
            Math.min(a.hi, b.hi) > Math.max(a.lo, b.lo) &&
            Math.abs(a.y - b.y) > 1e-6 &&
            Math.abs(a.y - b.y) < LANE_PITCH - 1e-6,
        )
        .map((b) => `${a.e.from}->${a.e.to} / ${b.e.from}->${b.e.to}`),
    );
    expect(tight).toEqual([]);
  });

  it("draws a band edge's mutual pair as one line (ADR-3027)", () => {
    // One relation each way between a local and a foreign entity, nothing else
    // on either card, so no lane bundle takes the pair (ADR-3027 decision 1).
    const { res: pair } = layoutOf(
      `system S {
  service A {
    domain Local {
      entity L {
        L -> Far.F "uses"
      }
    }
  }
  service B {
    domain Far {
      entity F {
        F -> Local.L "used by"
      }
    }
  }
}`,
      (s) => extractEntityView(s, ["S", "A", "Local"]),
    );
    const halves = bandEdges(pair).filter((e) => e.pairHalf);
    expect(halves.map((e) => `${e.from}->${e.to}`).sort()).toEqual(["Far.F->L", "L->Far.F"]);
  });
});

describe("ghost band routing on a band of single cards (#3881)", () => {
  // Every foreign domain contributes one ghost per side, so the band has no
  // frame of its own; its edges are routed all the same.
  const above = ["Billing", "Audit", "Search"];
  const below = ["Shipping", "Pricing", "Storage"];
  const src = `system S {
  service A {
    domain Hub {
      entity E0 {
${below.map((d) => `        E0 -> ${d}.${d}0 "uses"`).join("\n")}
        E0 -> E1 "next"
      }
      entity E1 {}
    }
  }
  service B {
${above.map((d) => `    domain ${d} {\n      entity ${d}0 {\n        ${d}0 -> Hub.E1 "refs"\n      }\n    }`).join("\n")}
${below.map((d) => `    domain ${d} {\n      entity ${d}0 {}\n    }`).join("\n")}
  }
}`;
  const { res } = layoutOf(src, (s) => extractEntityView(s, ["S", "A", "Hub"]));

  it("has a band without frames", () => {
    expect(res.containers.filter((c) => c.ghostBand !== undefined)).toEqual([]);
    expect(bandEdges(res)).toHaveLength(above.length + below.length);
  });

  it("crosses no frame title and stays inside the frame around the band", () => {
    const titles = res.containers.filter((c) => c.ghostBand === undefined).map(frameTitleBox);
    const outer = res.containers[0];
    const off = bandEdges(res).flatMap((e) => [
      ...(countPolylinePenetrations(pointsOf(e), titles) > 0 ? [`${e.from}->${e.to} title`] : []),
      ...pointsOf(e)
        .filter((p) => !inside({ ...p, width: 0, height: 0 }, outer))
        .map(() => `${e.from}->${e.to} outside`),
    ]);
    expect(off).toEqual([]);
  });
});

describe("ghost band routing beside a ghost system (#3881)", () => {
  // The service view fixture with a caller system: the frame around the band
  // grows round the band's routes, and the caller's frame keeps its distance.
  const src = serviceFixture().replace(
    /\n}$/,
    "\n}\nsystem Caller {\n  service Front {\n    -> Shop.Core\n  }\n}",
  );
  const { res } = layoutOf(src, (s) => extractView(s, ["Shop", "Core"]));

  it("keeps the caller's frame as far from the frame around the band as without a band", () => {
    const caller = res.containers.find((c) => c.id === "Caller")!;
    const outer = res.containers[0];
    expect(caller).toBeDefined();
    expect(outer.x - (caller.x + caller.width)).toBe(80);
  });
});

describe("ghost band routing off the canvas's labels (#3889)", () => {
  const { slice, res, options, styles } = layoutOf(orderingFixture(), (s) =>
    extractEntityView(s, ["Shop", "Commerce", "Ordering"]),
  );
  const palette = resolvePalette(undefined);
  /** The boxes of the canvas's drawn labels in `r`, by `from->to`. */
  const canvasLabels = (r: LayoutResult) => {
    const { inputs, nodeRects, edgeLines } = buildLabelInputs(r.edges, r.nodes, (e) =>
      resolvedEdgeStyle(styles, e),
    );
    const moved = resolveLabelPlacements(
      inputs,
      nodeRects,
      edgeLines,
      frameBordersOf(r, styles, palette),
    );
    return new Map(
      inputs
        .filter((l) => !l.deferred && r.edges[l.index].ghost !== true)
        .map((l) => {
          const e = r.edges[l.index];
          return [
            `${e.from}->${e.to}`,
            labelBox(moved.get(l.index) ?? l.anchor, l.width, l.fontSize),
          ];
        }),
    );
  };

  it("draws the canvas labels a band line ran through before (\"has\", \"holds\")", () => {
    expect([...canvasLabels(res).keys()].sort()).toEqual(["Cart->LineItem", "Order->LineItem"]);
  });

  it("runs no band line through a label the canvas draws", () => {
    const boxes = [...canvasLabels(res).values()];
    const through = bandEdges(res).filter((e) => countPolylinePenetrations(pointsOf(e), boxes) > 0);
    expect(through.map((e) => `${e.from}->${e.to}`)).toEqual([]);
  });

  it("leaves the canvas's labels where they are without the band's edges", () => {
    const without = layout({ ...slice, ghostEntityEdges: [] }, options);
    const rel = (r: LayoutResult) => {
      const f = focusOf(r);
      return [...canvasLabels(r)].map(([k, b]) => [
        k,
        +(b.x - f.x).toFixed(2),
        +(b.y - f.y).toFixed(2),
      ]);
    };
    expect(rel(res)).toEqual(rel(without));
  });

  it("still crosses no card and no band frame that holds neither end", () => {
    expect(bandPenetrations(res)).toEqual([]);
    expect(collinearWithBand(res)).toEqual([]);
  });
});
