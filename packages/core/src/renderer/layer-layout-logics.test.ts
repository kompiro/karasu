import { describe, expect, it } from "vitest";
import type { KrsEdge } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import {
  applyEdgeDirectionWithinLayer,
  gridColumnCount,
  wrapLayerIntoRows,
  GRID_COLUMN_CAP,
} from "./layer-layout-logics.js";

const loc: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 2, offset: 1 },
};

function edge(from: string, to: string): KrsEdge {
  return { from, to, kind: "sync", tags: [], loc };
}

describe("applyEdgeDirectionWithinLayer", () => {
  it("returns input unchanged when no edge directions are provided", () => {
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    expect(applyEdgeDirectionWithinLayer(["A", "B", "C"], [], undefined, layerOf)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("returns input unchanged when no edge has a horizontal hint", () => {
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
    ]);
    const directions = new Map([["A->B", "up" as const]]);
    expect(
      applyEdgeDirectionWithinLayer(["A", "B"], [edge("A", "B")], directions, layerOf),
    ).toEqual(["A", "B"]);
  });

  it("places source to the left of the target for direction:right (arrow flows rightward)", () => {
    // direction:right names the arrow flow direction, mirroring the
    // up/down convention. Arrow flows rightward → source on the left
    // of target.
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    const directions = new Map([["A->B", "right" as const]]);
    const result = applyEdgeDirectionWithinLayer(
      ["B", "C", "A"],
      [edge("A", "B")],
      directions,
      layerOf,
    );
    // A lands directly before B → A is to the left of B → arrow A→B
    // flows rightward.
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("places source to the right of the target for direction:left (arrow flows leftward)", () => {
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    const directions = new Map([["A->B", "left" as const]]);
    const result = applyEdgeDirectionWithinLayer(
      ["B", "C", "A"],
      [edge("A", "B")],
      directions,
      layerOf,
    );
    // A lands directly after B → A is to the right of B → arrow A→B
    // visually flows leftward.
    expect(result).toEqual(["B", "A", "C"]);
  });

  it("falls through to no-op when source and target sit in different layers", () => {
    const layerOf = new Map([
      ["A", 0],
      ["B", 1],
    ]);
    const directions = new Map([["A->B", "right" as const]]);
    const result = applyEdgeDirectionWithinLayer(["A"], [edge("A", "B")], directions, layerOf);
    expect(result).toEqual(["A"]);
  });

  it("ignores edges where one endpoint is not in the layer being ordered", () => {
    const layerOf = new Map([
      ["A", 0],
      ["B", 1],
    ]);
    const directions = new Map([["A->B", "right" as const]]);
    // Layer 1 contains only B. The hint references A from layer 0, so it
    // can't reorder layer 1 against an absent neighbour.
    const result = applyEdgeDirectionWithinLayer(["B"], [edge("A", "B")], directions, layerOf);
    expect(result).toEqual(["B"]);
  });

  it("resolves multiple horizontal hints with last-wins", () => {
    // Two conflicting hints on A: should end up immediately before C
    // (the last applied hint), since direction:right means arrow flows
    // rightward → source on left of target.
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    const directions = new Map([
      ["A->B", "right" as const],
      ["A->C", "right" as const],
    ]);
    const result = applyEdgeDirectionWithinLayer(
      ["A", "B", "C"],
      [edge("A", "B"), edge("A", "C")],
      directions,
      layerOf,
    );
    // After A->B right: [A, B, C] (A already left of B);
    // after A->C right: [B, A, C] (A pulled left of C).
    expect(result).toEqual(["B", "A", "C"]);
  });

  it("overrides bucketByColumn placement for the source endpoint (precedence rule)", () => {
    // Caller has already run bucketByColumn and produced [A, B, C] where
    // A is in the left bucket and C is in the right. An edge A->C with
    // direction:left means arrow flows leftward → source ends up right
    // of target, pulling A past C. Mirrors the precedence rule
    // documented in the design doc.
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    const directions = new Map([["A->C", "left" as const]]);
    const result = applyEdgeDirectionWithinLayer(
      ["A", "B", "C"],
      [edge("A", "C")],
      directions,
      layerOf,
    );
    expect(result).toEqual(["B", "C", "A"]);
  });
});

describe("gridColumnCount", () => {
  it("keeps small sets (<= cap) on a single row", () => {
    expect(gridColumnCount(1)).toBe(1);
    expect(gridColumnCount(2)).toBe(2);
    expect(gridColumnCount(3)).toBe(3);
    expect(gridColumnCount(GRID_COLUMN_CAP)).toBe(GRID_COLUMN_CAP); // 5 -> 5
  });

  it("auto-balances larger sets toward a square, capped at GRID_COLUMN_CAP", () => {
    expect(gridColumnCount(6)).toBe(3); // ceil(sqrt(6)) = 3
    expect(gridColumnCount(9)).toBe(3); // 3x3
    expect(gridColumnCount(10)).toBe(4); // ceil(sqrt(10)) = 4 -> 4,4,2
    expect(gridColumnCount(25)).toBe(5); // 5x5
    expect(gridColumnCount(30)).toBe(5); // capped: 5x6
  });

  it("handles degenerate counts", () => {
    expect(gridColumnCount(0)).toBe(1);
    expect(gridColumnCount(-3)).toBe(1);
  });

  it("honors a positive-integer hint outright, even above the cap", () => {
    expect(gridColumnCount(10, 2)).toBe(2);
    expect(gridColumnCount(3, 8)).toBe(8); // above cap, deliberate author choice
  });

  it("ignores non-positive / non-integer hints and falls back to auto", () => {
    expect(gridColumnCount(10, 0)).toBe(4);
    expect(gridColumnCount(10, -1)).toBe(4);
    expect(gridColumnCount(10, 2.5)).toBe(4);
  });

  it("is deterministic", () => {
    for (let n = 0; n <= 40; n++) {
      expect(gridColumnCount(n)).toBe(gridColumnCount(n));
    }
  });
});

describe("wrapLayerIntoRows", () => {
  const w = () => 100; // uniform width

  it("wraps at the column count, row-major in declaration order", () => {
    const rows = wrapLayerIntoRows(["a", "b", "c", "d", "e"], w, 2, 10_000, 10);
    expect(rows).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("wraps early when a row would exceed maxWidth, even under the column cap", () => {
    // columnCount 5 would keep them on one row, but maxWidth forces a break:
    // 3 nodes of width 100 with gap 10 = 320 > 250 -> break before the 3rd.
    const rows = wrapLayerIntoRows(["a", "b", "c", "d"], w, 5, 250, 10);
    expect(rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps everything on one row when neither bound trips", () => {
    expect(wrapLayerIntoRows(["a", "b", "c"], w, 5, 10_000, 10)).toEqual([["a", "b", "c"]]);
  });

  it("returns an empty array for no items", () => {
    expect(wrapLayerIntoRows([], w, 3, 1000, 10)).toEqual([]);
  });
});
