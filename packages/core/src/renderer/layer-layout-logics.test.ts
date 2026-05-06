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

  it("places source directly to the right of the target for direction:right", () => {
    // Layer: [B, C, A] — A starts at the end
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
    expect(result).toEqual(["B", "A", "C"]);
  });

  it("places source directly to the left of the target for direction:left", () => {
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
    expect(result).toEqual(["A", "B", "C"]);
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
    // Two conflicting hints on A: should end up to the right of C
    // (the last applied hint), even though an earlier hint placed it
    // adjacent to B.
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
    // After A->B right: [B, A, C]; after A->C right: [B, C, A]
    expect(result).toEqual(["B", "C", "A"]);
  });

  it("overrides bucketByColumn placement for the source endpoint (precedence rule)", () => {
    // Caller has already run bucketByColumn and produced [A, B, C] where
    // A is in the left bucket and C is in the right. An edge A->C with
    // direction:right should pull A out of its bucket so it lands next
    // to C, mirroring the precedence rule documented in the design doc.
    const layerOf = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);
    const directions = new Map([["A->C", "right" as const]]);
    const result = applyEdgeDirectionWithinLayer(
      ["A", "B", "C"],
      [edge("A", "C")],
      directions,
      layerOf,
    );
    expect(result).toEqual(["B", "C", "A"]);
  });
});
