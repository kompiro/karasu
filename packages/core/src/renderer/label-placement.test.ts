/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  resolveLabelPlacements,
  buildLabelInputs,
  labelBox,
  countLabelPenetrations,
  countLabelOverlaps,
  type LabelInput,
} from "./label-placement.js";
import type { Rect } from "./edge-geometry.js";
import type { LayoutEdge } from "./layout-types.js";
import type { EdgeDirection } from "../types/style.js";
import { layout } from "./layout.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { edgeStyleKey } from "../resolver/style-resolver.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A default-positioned (eligible) label input at `anchor` with a horizontal chord. */
function label(index: number, anchor: { x: number; y: number }, width: number): LabelInput {
  return { index, anchor, dir: { x: 100, y: 0 }, width, fontSize: 11, eligible: true };
}

/** Apply a placement map to inputs, returning the final label boxes. */
function boxesAfter(
  inputs: LabelInput[],
  placements: Map<number, { x: number; y: number }>,
): Rect[] {
  return inputs.map((i) => labelBox(placements.get(i.index) ?? i.anchor, i.width, i.fontSize));
}

describe("label-placement geometry helpers", () => {
  it("labelBox centres horizontally and sits above the baseline (baseline = anchor.y - 6)", () => {
    const box = labelBox({ x: 100, y: 50 }, 40, 11);
    // text-anchor=middle → centred on x; box spans width + horizontal padding.
    expect(box.x + box.width / 2).toBeCloseTo(100);
    expect(box.width).toBeGreaterThan(40);
    // Top is above the baseline by ~fontSize.
    expect(box.y).toBeLessThan(50 - 6);
  });

  it("countLabelPenetrations counts labels overlapping a node rect", () => {
    const node: Rect = { x: 90, y: 30, width: 40, height: 40 };
    const clear = labelBox({ x: 300, y: 50 }, 40, 11);
    const over = labelBox({ x: 100, y: 55 }, 40, 11);
    expect(countLabelPenetrations([clear], [node])).toBe(0);
    expect(countLabelPenetrations([over], [node])).toBe(1);
  });

  it("countLabelOverlaps counts unordered label pairs that overlap", () => {
    const a = labelBox({ x: 100, y: 50 }, 60, 11);
    const b = labelBox({ x: 110, y: 50 }, 60, 11); // overlaps a
    const c = labelBox({ x: 400, y: 50 }, 60, 11); // clear
    expect(countLabelOverlaps([a, b, c])).toBe(1);
    expect(countLabelOverlaps([a, c])).toBe(0);
  });
});

describe("resolveLabelPlacements", () => {
  it("leaves non-colliding labels untouched (empty override map → byte-stable)", () => {
    const inputs = [label(0, { x: 0, y: 0 }, 40), label(1, { x: 500, y: 0 }, 40)];
    const overrides = resolveLabelPlacements(inputs, []);
    expect(overrides.size).toBe(0);
  });

  it("separates two overlapping labels (label↔label overlaps → 0)", () => {
    const inputs = [label(0, { x: 100, y: 50 }, 80), label(1, { x: 110, y: 50 }, 80)];
    expect(countLabelOverlaps(boxesAfter(inputs, new Map()))).toBeGreaterThan(0);
    const overrides = resolveLabelPlacements(inputs, []);
    expect(countLabelOverlaps(boxesAfter(inputs, overrides))).toBe(0);
    // At least one of the pair moved.
    expect(overrides.size).toBeGreaterThan(0);
  });

  it("pushes a label off a node card it clips into (label↔node penetrations → 0)", () => {
    const node: Rect = { x: 70, y: 20, width: 60, height: 60 };
    const inputs = [label(0, { x: 100, y: 55 }, 40)];
    expect(countLabelPenetrations(boxesAfter(inputs, new Map()), [node])).toBe(1);
    const overrides = resolveLabelPlacements(inputs, [node]);
    expect(countLabelPenetrations(boxesAfter(inputs, overrides), [node])).toBe(0);
  });

  it("never moves an author-positioned label, but treats it as an obstacle", () => {
    // index 0 is author-fixed at the same spot the eligible index 1 defaults to.
    const fixed: LabelInput = {
      index: 0,
      anchor: { x: 100, y: 50 },
      dir: { x: 100, y: 0 },
      width: 80,
      fontSize: 11,
      eligible: false,
    };
    const movable = label(1, { x: 100, y: 50 }, 80);
    const overrides = resolveLabelPlacements([fixed, movable], []);
    // The fixed label is never in the override map.
    expect(overrides.has(0)).toBe(false);
    // The movable label was nudged clear of the fixed one.
    expect(overrides.has(1)).toBe(true);
    expect(countLabelOverlaps(boxesAfter([fixed, movable], overrides))).toBe(0);
  });

  it("is deterministic — identical inputs yield identical placements", () => {
    const mk = () => [label(0, { x: 100, y: 50 }, 80), label(1, { x: 110, y: 50 }, 80)];
    const a = resolveLabelPlacements(mk(), []);
    const b = resolveLabelPlacements(mk(), []);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("falls back best-effort when no candidate fully clears — never increases collisions", () => {
    // A node rect large enough that every capped candidate still overlaps.
    const huge: Rect = { x: -1000, y: -1000, width: 2000, height: 2000 };
    const inputs = [label(0, { x: 0, y: 0 }, 40)];
    const before = countLabelPenetrations(boxesAfter(inputs, new Map()), [huge]);
    let overrides!: Map<number, { x: number; y: number }>;
    expect(() => (overrides = resolveLabelPlacements(inputs, [huge]))).not.toThrow();
    // best-effort must not make things worse than leaving the label at default.
    expect(countLabelPenetrations(boxesAfter(inputs, overrides), [huge])).toBeLessThanOrEqual(
      before,
    );
  });
});

describe("buildLabelInputs", () => {
  const styles = resolveStyles(
    Parser.parse('system S { service A { label "A" } service B { label "B" } }').value.systems,
    [getBuiltinStyleSheet()],
  );
  const styleFor = () => styles.defaultEdgeStyle;

  it("excludes ghost and cyclic edges (peripheral geometry — ADR-968), keeps real ones", () => {
    const edges: LayoutEdge[] = [
      { from: "A", to: "B", label: "real", fromPoint: { x: 0, y: 0 }, toPoint: { x: 100, y: 0 } },
      {
        from: "A",
        to: "C",
        label: "ghost",
        fromPoint: { x: 0, y: 0 },
        toPoint: { x: 0, y: 100 },
        ghost: true,
      },
      {
        from: "A",
        to: "D",
        label: "cyclic",
        fromPoint: { x: 0, y: 0 },
        toPoint: { x: 50, y: 50 },
        cyclic: true,
      },
    ];
    const { inputs } = buildLabelInputs(edges, new Map(), styleFor);
    // Only the real edge (index 0) participates — ghost/cyclic neither move nor obstruct.
    expect(inputs.map((i) => i.index)).toEqual([0]);
  });

  it("nudges perpendicular to the local segment, not the from→to chord, for bent routes", () => {
    // L-shaped route: horizontal segment (0,0)→(100,0) is the longest, so the
    // label anchors on it; the from→to chord is the diagonal (0,0)→(100,100).
    const edge: LayoutEdge = {
      from: "A",
      to: "B",
      label: "x",
      fromPoint: { x: 0, y: 0 },
      waypoints: [{ x: 100, y: 0 }],
      toPoint: { x: 100, y: 100 },
    };
    const { inputs } = buildLabelInputs([edge], new Map(), styleFor);
    // dir follows the horizontal local segment (y === 0), not the diagonal chord (y === 100).
    expect(inputs[0].dir.y).toBe(0);
    expect(inputs[0].dir.x).toBeGreaterThan(0);
  });
});

describe("real sample fence — ec-platform system top view (#2048)", () => {
  // TPL-20260715-01 / TPL-20260711-02: fence a real diagram numerically. The
  // top view of 01-system.krs reproduces #2048 (a wide async label clips a
  // service card). After the pass, no edge-label box may penetrate a node card
  // and no two labels may overlap.
  it("resolves all label↔node penetrations and label↔label overlaps to zero", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../examples/en/ec-platform/01-system.krs"),
      "utf8",
    );
    const parsed = Parser.parse(src);
    const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
    const viewSlice = extractView(parsed.value.systems, []);
    const edgeDirections = new Map<string, EdgeDirection>();
    for (const [key, e] of styles.edges) {
      if (e.direction !== "auto") edgeDirections.set(key, e.direction);
    }
    const layoutResult = layout(viewSlice, {
      ownerIndex: parsed.value.ownerIndex,
      layoutHints: styles.layoutHints,
      edgeDirections,
    });

    const styleFor = (edge: LayoutEdge) =>
      styles.edges.get(edgeStyleKey(edge.from, edge.to, edge.kind)) ??
      styles.edges.get(`${edge.from}->${edge.to}`) ??
      styles.defaultEdgeStyle;

    const { inputs, nodeRects } = buildLabelInputs(
      layoutResult.edges,
      layoutResult.nodes,
      styleFor,
    );

    // Precondition: this real sample actually reproduces the collision at default
    // placement (guards against a vacuous fence — see TPL-20260715-01).
    const before = boxesAfter(inputs, new Map());
    expect(countLabelPenetrations(before, nodeRects)).toBeGreaterThan(0);

    // Postcondition: the pass clears every measured collision.
    const overrides = resolveLabelPlacements(inputs, nodeRects);
    const after = boxesAfter(inputs, overrides);
    expect(countLabelPenetrations(after, nodeRects)).toBe(0);
    expect(countLabelOverlaps(after)).toBe(0);
  });
});
