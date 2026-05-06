import { describe, expect, it } from "vitest";
import type { KrsEdge } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import { applyEdgeDirectionWithinLayer } from "./layer-layout-logics.js";

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
