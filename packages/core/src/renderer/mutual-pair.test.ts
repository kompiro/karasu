import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { collectModelWarnings } from "../resolver/model-warnings.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { compile } from "../compile/compile.js";
import { edgeKey } from "../diff/view-diff.js";
import { layout } from "./layout.js";
import { edgeLineKeyOf } from "./svg-renderer.js";
import { applyMutualPairs, chooseSplit, findMutualPairs, pairLabelSegment } from "./mutual-pair.js";
import { HOP_RADIUS } from "./crossing-marks.js";
import { buildLabelInputs, labelBox, resolveLabelPlacements } from "./label-placement.js";
import { directionArrow } from "./edge-label-disclosure.js";
import type { Point } from "./edge-geometry.js";
import type { LayoutEdge, LayoutResult, Rect } from "./layout-types.js";

const here = dirname(fileURLToPath(import.meta.url));
const UMAMI = readFileSync(resolve(here, "fixtures/dense-domain-canvas.krs"), "utf8");
const UMAMI_PATH = ["Umami", "UmamiApp"];

const lineOf = (e: LayoutEdge): Point[] => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

interface Run {
  result: LayoutResult;
}

/** `layout()` the way `render()` calls it, with or without the line key. */
function laidOut(
  src: string,
  path: string[],
  opts: { style?: string; withKey?: boolean; diff?: Map<string, string>; groupBy?: "team" } = {},
): Run["result"] {
  const file = Parser.parse(src).value;
  const sheets = [getBuiltinStyleSheet()];
  if (opts.style) sheets.push(StyleParser.parse(opts.style).value);
  // As `compile` does: the analysis marks cyclic edges and assigns the
  // canonical ids `edge#` selectors match.
  collectModelWarnings(file, sheets);
  const styles = resolveStyles(file.systems, sheets);
  return layout(extractView(file.systems, path), {
    ownerIndex: file.ownerIndex,
    layoutHints: styles.layoutHints,
    edgeDirections: new Map(),
    edgeDiffState: opts.diff,
    groupBy: opts.groupBy,
    edgeLineKey: opts.withKey === false ? undefined : edgeLineKeyOf(styles, opts.diff),
  });
}

const halves = (r: LayoutResult) => r.edges.filter((e) => e.pairHalf);
const linesDrawn = (r: LayoutResult) => r.edges.length - halves(r).length / 2;

function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Crossing points between distinct edges' lines. Two halves meet end to end, which is no crossing. */
function crossings(edges: readonly LayoutEdge[]): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = lineOf(edges[i]);
      const b = lineOf(edges[j]);
      for (let s = 0; s + 1 < a.length; s++) {
        for (let t = 0; t + 1 < b.length; t++) {
          if (properCross(a[s], a[s + 1], b[t], b[t + 1])) n++;
        }
      }
    }
  }
  return n;
}

/** Where along `line` (arc length from its start) `p` lies, or `undefined` when off it. */
function alongLine(line: Point[], p: Point): number | undefined {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 1e-9) {
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      if (t >= -1e-6 && t <= 1 + 1e-6 && Math.hypot(q.x - p.x, q.y - p.y) < 0.5)
        return acc + t * len;
    }
    acc += len;
  }
  return undefined;
}

/** Arc lengths along `line` of its crossings with `others`. */
function crossingsAlong(line: Point[], others: Point[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    for (const o of others) {
      for (let k = 0; k + 1 < o.length; k++) {
        if (!properCross(line[i], line[i + 1], o[k], o[k + 1])) continue;
        const [a, b, c, d] = [line[i], line[i + 1], o[k], o[k + 1]];
        const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
        out.push(alongLine(line, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })!);
      }
    }
  }
  return out;
}

/**
 * The box of every label the canvas draws, by edge index, after the placement
 * pass: the same inputs, styles and pass `render()` uses for this layout.
 */
function placedLabels(r: LayoutResult): Map<number, Rect> {
  const file = Parser.parse(UMAMI).value;
  const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
  const { inputs, nodeRects, edgeLines } = buildLabelInputs(
    r.edges,
    r.nodes,
    (e) => styles.edges.get(`${e.from}->${e.to}`) ?? styles.defaultEdgeStyle,
  );
  const moved = resolveLabelPlacements(inputs, nodeRects, edgeLines, []);
  return new Map(
    inputs
      .filter((l) => !l.deferred)
      .map((l) => [l.index, labelBox(moved.get(l.index) ?? l.anchor, l.width, l.fontSize)]),
  );
}

const contains = (r: Rect, p: Point) =>
  p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The two halves of each merged pair in `r`, as `[forward, backward]`. */
function pairsOf(r: LayoutResult): [LayoutEdge, LayoutEdge][] {
  const hs = halves(r);
  return hs.flatMap((a) => {
    const b = hs.find((e) => e.from === a.to && e.to === a.from);
    return b && r.edges.indexOf(a) < r.edges.indexOf(b) ? [[a, b] as [LayoutEdge, LayoutEdge]] : [];
  });
}

const PAIR = `system S {
  service App {
    domain Orders {
      -> Payments "charges the order total"
    }
    domain Payments {
      -> Orders "reports settlement"
    }
    domain Catalog {
      -> Orders "publishes price changes"
    }
  }
}`;
const PAIR_PATH = ["S", "App"];

function edge(
  from: string,
  to: string,
  line: Point[],
  extra: Partial<LayoutEdge> = {},
): LayoutEdge {
  return {
    from,
    to,
    kind: "sync",
    fromPoint: line[0],
    toPoint: line[line.length - 1],
    waypoints: line.length > 2 ? line.slice(1, -1) : undefined,
    ...extra,
  };
}
const ANY_KEY = () => "k";

/** The `<g>` of the PAIR fixture's two edges, `Orders -> Payments` first. */
function pairGroups(svg: string): [string, string] {
  const groups = [...svg.matchAll(/<g data-edge-from[^>]*>[\s\S]*?<\/g>/g)].map((m) => m[0]);
  const of = (label: string) => groups.find((g) => g.includes(`data-edge-label="${label}"`))!;
  return [of("charges the order total"), of("reports settlement")];
}

/** Where a group's hit-line starts, from a `<line>` or a `<path>`. */
function hitStart(group: string): [number, number] | undefined {
  const hit = /<(?:line|path)[^>]*class="krs-edge__hitline"[^>]*>/.exec(group)?.[0] ?? "";
  const line = /x1="([-\d.]+)" y1="([-\d.]+)"/.exec(hit);
  const path = /d="M\s*([-\d.]+)[ ,]([-\d.]+)/.exec(hit);
  const m = line ?? path;
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

describe("mutual pair drawn as one line (#3027)", () => {
  describe("the dense domain canvas (Umami fixture)", () => {
    const before = laidOut(UMAMI, UMAMI_PATH, { withKey: false });
    const after = laidOut(UMAMI, UMAMI_PATH);

    it("draws 27 lines instead of 41, with every authored edge still its own LayoutEdge", () => {
      expect(before.edges).toHaveLength(41);
      expect(linesDrawn(before)).toBe(41);
      expect(after.edges).toHaveLength(41);
      expect(pairsOf(after)).toHaveLength(14);
      expect(linesDrawn(after)).toBe(27);
    });

    it("crosses 61 times or fewer instead of 157", () => {
      expect(crossings(before.edges)).toBe(157);
      expect(crossings(after.edges)).toBeLessThanOrEqual(61);
    });

    it("moves no card", () => {
      for (const [key, node] of before.nodes) {
        const moved = after.nodes.get(key)!;
        expect({ x: moved.x, y: moved.y }).toEqual({ x: node.x, y: node.y });
      }
    });

    it("joins the two halves of each pair at one shared point, each ending at its own target", () => {
      for (const [a, b] of pairsOf(after)) {
        expect(same(a.fromPoint, b.fromPoint)).toBe(true);
        const orig = before.edges.find((e) => e.from === a.from && e.to === a.to)!;
        const origBack = before.edges.find((e) => e.from === b.from && e.to === b.to)!;
        // The earlier edge's route is the shared line, so its target end is kept
        // and the later edge ends where the earlier one started.
        const first = before.edges.indexOf(orig) < before.edges.indexOf(origBack) ? orig : origBack;
        const [fwd, back] = first === orig ? [a, b] : [b, a];
        expect(same(fwd.toPoint, first.toPoint)).toBe(true);
        expect(same(back.toPoint, first.fromPoint)).toBe(true);
      }
    });

    it("keeps every split clear of corners, crossings and every hop over its line", () => {
      const hops = after.crossingMarks!.hops;
      for (const [a, b] of pairsOf(after)) {
        const others = after.edges.filter((e) => e !== a && e !== b).map(lineOf);
        for (const half of [a, b]) {
          const line = lineOf(half);
          // Not on a corner: the first segment of each half is at least 10px long.
          expect(Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y)).toBeGreaterThanOrEqual(
            10 - 1e-6,
          );
          // A crossing is at least 14px from the split, along the half.
          for (const at of crossingsAlong(line, others))
            expect(at).toBeGreaterThanOrEqual(14 - 1e-6);
          // A hop on the half: its gap (hosted by the half) or its arc (hosted by
          // the line crossing over) ends before the split.
          for (const hop of hops) {
            const at = alongLine(line, hop);
            if (at === undefined) continue;
            const reach = after.edges[hop.edge] === half ? hop.halfWidth : (hop.ry ?? 0);
            expect(at, `hop at ${hop.x},${hop.y}`).toBeGreaterThanOrEqual(
              Math.max(14, reach) - 1e-6,
            );
          }
        }
      }
    });

    it("puts each hop on the half it lies on", () => {
      for (const hop of after.crossingMarks!.hops) {
        const line = lineOf(after.edges[hop.edge]);
        const onLine = line.slice(1).some((b, i) => {
          const a = line[i];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const t = ((hop.x - a.x) * (b.x - a.x) + (hop.y - a.y) * (b.y - a.y)) / (len * len);
          const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          return t >= 0 && t <= 1 && Math.hypot(q.x - hop.x, q.y - hop.y) < 0.5;
        });
        expect(onLine, `hop at ${hop.x},${hop.y}`).toBe(true);
      }
    });

    it("seats the two labels of a pair apart, neither over the split", () => {
      const placed = placedLabels(after);
      let seated = 0;
      for (const [a, b] of pairsOf(after)) {
        const boxes = [a, b].flatMap((half) => {
          const box = placed.get(after.edges.indexOf(half));
          return box ? [box] : [];
        });
        for (const box of boxes) expect(contains(box, a.fromPoint)).toBe(false);
        const [first, second] = boxes;
        expect(first !== undefined && second !== undefined && overlap(first, second)).toBe(false);
        seated += boxes.length;
      }
      // The check means something only if pairs' labels are on the canvas.
      expect(seated).toBeGreaterThan(10);
    });

    it("leaves no more labels off the canvas than two lines did", () => {
      expect(placedLabels(after).size).toBeGreaterThanOrEqual(placedLabels(before).size);
    });

    it("still merges every pair when a global rule positions the labels", () => {
      const offset = laidOut(UMAMI, UMAMI_PATH, { style: "edge { label-offset: 0 8px; }" });
      expect(pairsOf(offset)).toHaveLength(14);
    });
  });

  describe("only pairs the reader cannot tell apart are merged (TPL-3027)", () => {
    it("merges a same-kind, same-style pair", () => {
      expect(pairsOf(laidOut(PAIR, PAIR_PATH))).toHaveLength(1);
    });

    it("keeps a sync and an async edge as two lines", () => {
      const src = PAIR.replace("-> Orders", "--> Orders");
      expect(halves(laidOut(src, PAIR_PATH))).toHaveLength(0);
    });

    it.each([
      ["colour", "edge[from=Orders] { color: #ff0000; }"],
      ["width", "edge[from=Orders] { stroke-width: 3; }"],
      ["stroke style", "edge[from=Orders] { stroke-style: dotted; }"],
    ])("keeps a pair whose %s differs as two lines", (_, style) => {
      expect(halves(laidOut(PAIR, PAIR_PATH, { style }))).toHaveLength(0);
    });

    it("merges when both edges carry the same style", () => {
      const style = "edge[from=Orders] { color: #ff0000; } edge[from=Payments] { color: #ff0000; }";
      expect(pairsOf(laidOut(PAIR, PAIR_PATH, { style }))).toHaveLength(1);
    });

    it("keeps a pair whose diff states differ as two lines", () => {
      const diff = new Map([[edgeKey({ from: "Orders", to: "Payments" }), "added"]]);
      expect(halves(laidOut(PAIR, PAIR_PATH, { diff }))).toHaveLength(0);
      diff.set(edgeKey({ from: "Payments", to: "Orders" }), "added");
      expect(pairsOf(laidOut(PAIR, PAIR_PATH, { diff }))).toHaveLength(1);
    });

    it("keeps a cyclic pair (a sync cycle in one edge list) as two lines", () => {
      const src = `system S {
  service A
  service B
  A -> B
  B -> A
}`;
      const r = laidOut(src, ["S"]);
      expect(r.edges.some((e) => e.cyclic)).toBe(true);
      expect(halves(r)).toHaveLength(0);
    });

    it("keeps a pair across two Group-by bands as two lines (one runs against the flow)", () => {
      const src = `system Shop {
  service Billing { -> Search }
  service Search { -> Billing }
}
organization Org {
  team "payments" { owns Billing }
  team "catalog" { owns Search }
}`;
      expect(pairsOf(laidOut(src, ["Shop"]))).toHaveLength(1);
      const grouped = laidOut(src, ["Shop"], { groupBy: "team" });
      expect(grouped.edges.some((e) => e.groupBackward)).toBe(true);
      expect(halves(grouped)).toHaveLength(0);
    });

    it("never pairs edges across systems on the multi-system root", () => {
      const src = `system One {
  service Api { -> Store }
  service Store
}
system Two {
  service Api
  service Store { -> Api }
}`;
      const r = laidOut(src, []);
      expect(r.edges.filter((e) => e.fromKey !== undefined)).toHaveLength(2);
      expect(halves(r)).toHaveLength(0);
    });

    it("pairs within one system on the multi-system root", () => {
      const src = `system One {
  service Web { --> Queue }
  service Queue { --> Web }
}
system Two {
  service Other
}`;
      expect(pairsOf(laidOut(src, []))).toHaveLength(1);
    });

    it("leaves the layout untouched without a line key (draw.io, bare layout)", () => {
      const without = laidOut(PAIR, PAIR_PATH, { withKey: false });
      expect(halves(without)).toHaveLength(0);
    });

    it("lays a canvas without a pair out exactly as before", () => {
      const src = PAIR.replace(
        /domain Payments \{\n\s+-> Orders "reports settlement"\n\s+\}/,
        "domain Payments",
      );
      expect(laidOut(src, PAIR_PATH)).toEqual(laidOut(src, PAIR_PATH, { withKey: false }));
    });

    const a = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const b = [...a].reverse();
    it.each<[string, Partial<LayoutEdge>]>([
      ["ghost", { ghost: true }],
      ["cyclic", { cyclic: true }],
      ["groupBackward", { groupBackward: true }],
      ["trunked (fan-in)", { trunkId: "B" }],
      ["trunked (fan-out)", { outTrunkId: "A" }],
      ["bundled", { bundleIndex: 0, bundleSize: 2 }],
    ])("does not pair an edge that is %s", (_, mark) => {
      expect(findMutualPairs([edge("A", "B", a), edge("B", "A", b, mark)], ANY_KEY)).toEqual([]);
      expect(findMutualPairs([edge("A", "B", a), edge("B", "A", b)], ANY_KEY)).toEqual([[0, 1]]);
    });

    it.each([
      "__collapsed_datastore__",
      "__group_collapsed_Team__",
      "Sys.__collapsed_Sys_external__",
    ])("does not pair an edge to the collapse stub %s", (stub) => {
      expect(findMutualPairs([edge("A", stub, a), edge(stub, "A", b)], ANY_KEY)).toEqual([]);
    });

    it("does not pair when either direction has a parallel edge", () => {
      const edges = [edge("A", "B", a), edge("B", "A", b), edge("A", "B", a, { kind: "async" })];
      expect(findMutualPairs(edges, ANY_KEY)).toEqual([]);
    });

    it("does not pair an intra-system edge with a cross-system one", () => {
      const edges = [
        edge("Api", "Store", a, { fromKey: "One/Api", toKey: "One/Store" }),
        edge("Store", "Api", b),
      ];
      expect(findMutualPairs(edges, ANY_KEY)).toEqual([]);
    });
  });

  describe("where the line splits", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const none = { hops: [], junctions: [], bands: [] };

    it("splits at the middle when nothing is near it", () => {
      expect(chooseSplit(line, [], none, 0)).toBe(100);
    });

    it("slides off a crossing by at least 14px", () => {
      const other = [
        { x: 100, y: -50 },
        { x: 100, y: 50 },
      ];
      expect(chooseSplit(line, [other], none, 0)).toBe(86);
    });

    it("keeps out of the whole gap of a wide hop the line hosts", () => {
      const wide = { x: 100, y: 0, halfWidth: 30, angle: 0, edge: 0 };
      expect(chooseSplit(line, [], { ...none, hops: [wide] }, 0)).toBe(70);
    });

    it("keeps under an arc another line hosts as far as the arc is tall", () => {
      const tall = { x: 100, y: 0, halfWidth: HOP_RADIUS, angle: 90, edge: 1, ry: 20 };
      expect(chooseSplit(line, [], { ...none, hops: [tall] }, 0)).toBe(80);
    });

    it("keeps 10px off a corner", () => {
      const bent = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ];
      expect(chooseSplit(bent, [], none, 0)).toBe(90);
    });

    it("finds no split when the middle two-thirds is all crossings", () => {
      const others = [40, 60, 80, 100, 120, 140, 160].map((x) => [
        { x, y: -50 },
        { x, y: 50 },
      ]);
      expect(chooseSplit(line, others, none, 0)).toBeUndefined();
    });

    it("chooses again when a pair that went back to two lines crosses another pair's split", () => {
      // Pair 0/1 has a crossing (edge 4) over its whole middle, so it stays two
      // lines. Its dropped route, edge 1, then crosses pair 2/3 at that pair's
      // middle, which the first choice could not have seen.
      const edges = [
        edge("A", "B", [
          { x: 95, y: 40 },
          { x: 105, y: 40 },
        ]),
        edge("B", "A", [
          { x: 100, y: 45 },
          { x: 100, y: 150 },
        ]),
        edge("C", "D", [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ]),
        edge("D", "C", [
          { x: 200, y: 300 },
          { x: 0, y: 300 },
        ]),
        edge("E", "F", [
          { x: 100, y: 30 },
          { x: 100, y: 38 },
          { x: 101, y: 50 },
        ]),
      ];
      applyMutualPairs(edges, ANY_KEY);
      expect(edges[0].pairHalf).toBeUndefined();
      expect(edges[1].pairHalf).toBeUndefined();
      expect(edges[2].pairHalf).toBe(true);
      expect(edges[2].fromPoint).toEqual({ x: 86, y: 100 });
      expect(edges[3].fromPoint).toEqual({ x: 86, y: 100 });
      expect(edges[3].toPoint).toEqual({ x: 0, y: 100 });
    });

    it("maps every mark back to the full edge list", () => {
      // The hop rides the more horizontal line, C->D, which sits after the
      // dropped edge: index 1 in the list the marks are computed on, 2 here.
      const edges = [
        edge("A", "B", [
          { x: 0, y: 0 },
          { x: 0, y: 200 },
        ]),
        edge("B", "A", [
          { x: 50, y: 200 },
          { x: 50, y: 0 },
        ]),
        edge("C", "D", [
          { x: -20, y: 40 },
          { x: 20, y: 40 },
        ]),
      ];
      const marks = applyMutualPairs(edges, ANY_KEY);
      expect(edges[0].pairHalf).toBe(true);
      expect(marks.hops).toHaveLength(1);
      expect(marks.hops[0].edge).toBe(2);
    });

    it("hands a hop the shared line hosts to the half it lies on", () => {
      const edges = [
        edge("A", "B", [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ]),
        edge("B", "A", [
          { x: 200, y: 50 },
          { x: 0, y: 50 },
        ]),
        edge("C", "D", [
          { x: 40, y: -20 },
          { x: 40, y: 20 },
        ]),
      ];
      const marks = applyMutualPairs(edges, ANY_KEY);
      expect(marks.hops).toHaveLength(1);
      // At x=40, before the split at 100: the half that runs back to A.
      expect(marks.hops[0].edge).toBe(1);
    });
  });

  describe("labels", () => {
    it("labels the longest segment of a half that does not touch the split", () => {
      const half = edge("A", "B", [
        { x: 0, y: 0 },
        { x: 0, y: 200 },
        { x: 50, y: 200 },
        { x: 50, y: 260 },
      ]);
      expect(pairLabelSegment(half)).toBe(2);
      expect(
        pairLabelSegment(
          edge("A", "B", [
            { x: 0, y: 0 },
            { x: 9, y: 0 },
          ]),
        ),
      ).toBeUndefined();
    });

    it.each<[Point, string]>([
      [{ x: 1, y: 0 }, "→"],
      [{ x: 1, y: 1 }, "↘"],
      [{ x: 0, y: 1 }, "↓"],
      [{ x: -1, y: 1 }, "↙"],
      [{ x: -1, y: 0 }, "←"],
      [{ x: -1, y: -1 }, "↖"],
      [{ x: 0, y: -1 }, "↑"],
      [{ x: 1, y: -1 }, "↗"],
    ])("points %j as %s", (dir, arrow) => {
      expect(directionArrow(dir)).toBe(arrow);
    });

    it("draws each label behind the arrow of its own half and keeps the authored text", () => {
      const { svg } = compile(PAIR, { viewPath: PAIR_PATH });
      const groups = [...svg.matchAll(/<g data-edge-from[^>]*>[\s\S]*?<\/g>/g)].map((m) => m[0]);
      const charge = groups.find((g) => g.includes('data-edge-label="charges the order total"'))!;
      const settle = groups.find((g) => g.includes('data-edge-label="reports settlement"'))!;
      const publish = groups.find((g) => g.includes('data-edge-label="publishes price changes"'))!;
      const drawn = (g: string) =>
        /<text[^>]*>([\s\S]*?)<\/text>/.exec(g)?.[1].replace(/<[^>]+>/g, "");
      // The arrow is its own tspan, so a reader of the drawn text can leave it out.
      expect(charge).toMatch(/<tspan class="krs-edge__cue">[→↘↓↙←↖↑↗] <\/tspan>charges/);
      const arrowOf = (text: string | undefined) => text?.split(" ")[0];
      expect(drawn(charge)).toMatch(/^[→↘↓↙←↖↑↗] charges the order total$/);
      expect(drawn(settle)).toMatch(/^[→↘↓↙←↖↑↗] reports settlement$/);
      // In this fixture the two labels sit on segments running different ways.
      expect(arrowOf(drawn(charge))).not.toBe(arrowOf(drawn(settle)));
      // An edge outside a pair is drawn as before.
      expect(drawn(publish)).toBe("publishes price changes");
    });

    it("keeps a withheld label's full text reachable on its half", () => {
      const { svg } = compile(PAIR, {
        viewPath: PAIR_PATH,
        styleSource: "edge { label-display: hover; }",
      });
      const [charge, settle] = pairGroups(svg);
      expect(hitStart(charge)).toEqual(hitStart(settle));
      expect(charge).toContain("<title>charges the order total</title>");
      expect(settle).toContain("<title>reports settlement</title>");
    });

    it("gives each half its own hit-line, both starting at the split", () => {
      const [charge, settle] = pairGroups(compile(PAIR, { viewPath: PAIR_PATH }).svg);
      expect(hitStart(charge)).toBeDefined();
      expect(hitStart(charge)).toEqual(hitStart(settle));
    });
  });
});
