import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { computeEdgePoints } from "./layout-edges.js";
import { countPolylinePenetrations, type Point, type Rect } from "./edge-geometry.js";
import type { KrsEdge } from "../types/ast.js";
import type { LayoutEdge, LayoutNode, LayoutResult } from "./layout-types.js";

const here = dirname(fileURLToPath(import.meta.url));
const UMAMI = readFileSync(resolve(here, "fixtures/dense-domain-canvas.krs"), "utf8");

/** The drill-down canvas the renderer draws, with its shapes (every card here is a rectangle). */
function umamiApp(): LayoutResult {
  const file = Parser.parse(UMAMI).value;
  const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
  return layout(extractView(file.systems, ["Umami", "UmamiApp"]), {
    ownerIndex: file.ownerIndex,
    shapeForNode: (id) => {
      const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
      return typeof style.shape === "string" ? style.shape : style.shape.url;
    },
  });
}

const lineOf = (e: LayoutEdge): Point[] => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
const cardOf = (r: LayoutResult, id: string): LayoutNode => {
  const card = [...r.nodes.values()].find((n) => n.id === id);
  if (!card) throw new Error(`no card ${id}`);
  return card;
};
const inside = (p: Point, c: Rect): boolean =>
  p.x > c.x && p.x < c.x + c.width && p.y > c.y && p.y < c.y + c.height;

describe("anchors between cards of one layer on different rows (#3494, TPL-3494)", () => {
  // The width budget wraps the domains of this canvas onto three rows, and
  // mutual dependencies put several of them in one layer. Before the fix those
  // edges were anchored side to side: 12 runs through an own card, 6 hidden
  // arrowheads.
  const r = umamiApp();
  const edges = r.edges.filter((e) => !e.ghost);

  it("never runs an edge through the inside of its own endpoint cards", () => {
    const through = edges.filter(
      (e) => countPolylinePenetrations(lineOf(e), [cardOf(r, e.from), cardOf(r, e.to)]) > 0,
    );
    expect(through.map((e) => `${e.from} -> ${e.to}`)).toEqual([]);
  });

  it("leaves every arrowhead outside its target card, where the card cannot cover it", () => {
    const hidden = edges.filter((e) => {
      const pts = lineOf(e);
      const [a, b] = pts.slice(-2);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      // The middle of the arrowhead: 6px back from the tip along the last segment.
      const head = { x: b.x - ((b.x - a.x) / len) * 6, y: b.y - ((b.y - a.y) / len) * 6 };
      return inside(head, cardOf(r, e.to));
    });
    expect(hidden.map((e) => `${e.from} -> ${e.to}`)).toEqual([]);
  });

  it("still anchors cards of one row side to side", () => {
    const sameRow = edges.filter((e) => {
      const f = cardOf(r, e.from);
      const t = cardOf(r, e.to);
      return !e.waypoints?.length && f.y < t.y + t.height && t.y < f.y + f.height;
    });
    expect(sameRow.length).toBeGreaterThan(0);
    for (const e of sameRow) {
      const f = cardOf(r, e.from);
      expect([f.x, f.x + f.width]).toContainEqual(e.fromPoint.x);
    }
  });
});

describe("computeEdgePoints anchors by row, not by layer (#3494, TPL-3494)", () => {
  // Hand-placed, so the cases hold whatever the width budget does to a real
  // canvas: A and B share a row, C is on the next row, all three in layer 0.
  const card = (id: string, x: number, y: number, height = 80): LayoutNode =>
    ({ id, x, y, width: 200, height }) as LayoutNode;
  const nodes = new Map(
    [card("A", 0, 0), card("B", 300, 20, 40), card("C", 100, 200)].map((c) => [c.id, c]),
  );
  const layers = new Map([...nodes.keys()].map((id) => [id, 0]));
  const anchor = (from: string, to: string) => {
    const e = computeEdgePoints({ from, to } as KrsEdge, nodes, layers);
    if (!e) throw new Error(`no edge ${from} -> ${to}`);
    return { from: e.fromPoint, to: e.toPoint };
  };

  it("anchors two cards of one row side to side, even of different heights", () => {
    expect(anchor("A", "B")).toEqual({ from: { x: 200, y: 40 }, to: { x: 300, y: 40 } });
    expect(anchor("B", "A")).toEqual({ from: { x: 300, y: 40 }, to: { x: 200, y: 40 } });
  });

  it("anchors down to a card of the same layer on a later row bottom to top", () => {
    expect(anchor("A", "C")).toEqual({ from: { x: 100, y: 80 }, to: { x: 200, y: 200 } });
  });

  it("anchors up to a card of the same layer on an earlier row top to bottom", () => {
    expect(anchor("C", "A")).toEqual({ from: { x: 200, y: 200 }, to: { x: 100, y: 80 } });
  });
});
