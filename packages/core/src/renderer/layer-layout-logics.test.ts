import { describe, expect, it } from "vitest";
import type { KrsEdge } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import {
  applyEdgeDirectionWithinLayer,
  gridColumnCount,
  wrapLayerIntoRows,
  GRID_COLUMN_CAP,
  placeNodesInLayers,
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

describe("placeNodesInLayers (#2514)", () => {
  const GAPS = { layerGap: 120, nodeGap: 60, maxLayerWidth: 1200, groupTitleGap: 60 };

  function place(
    nodesByLayer: Map<number, string[]>,
    opts: Partial<Parameters<typeof placeNodesInLayers>[0]> = {},
  ) {
    return placeNodesInLayers({
      sortedLayers: [...nodesByLayer.keys()].sort((a, b) => a - b),
      nodesByLayer,
      edges: [],
      edgeDirections: undefined,
      layers: new Map(),
      forcedLayers: new Map(),
      layoutHints: undefined,
      gridHint: undefined,
      groupStartLayer: new Map(),
      gaps: GAPS,
      measure: () => ({ width: 200, height: 80 }),
      ...opts,
    });
  }

  it("wraps on the same threshold the shared row wrapper uses", () => {
    // Five 200-wide cards with a 60 gap measure 200*5 + 60*4 = 1240 > 1200, so
    // the fifth wraps; four fit at 1080. The multi-system path used to compare
    // a running x that already carried the leading gap and so wrapped a card
    // early — the divergence this helper closes.
    const ids = ["a", "b", "c", "d", "e"];
    const { placements } = place(new Map([[0, ids]]), { gridHint: 99 });
    const rows = new Set(ids.map((id) => placements.get(id)!.y));
    expect(rows.size).toBe(2);
    expect(placements.get("d")!.y).toBe(placements.get("a")!.y);
    expect(placements.get("e")!.y).toBeGreaterThan(placements.get("a")!.y);
  });

  it("minimises crossings by barycenter when the layering is not forced", () => {
    // Second layer declared in the crossing order; the barycenter of each node
    // is its predecessor's centre, so the pass swaps them back.
    const nodesByLayer = new Map([
      [0, ["p1", "p2"]],
      [1, ["c2", "c1"]],
    ]);
    const edges = [
      { from: "p1", to: "c1", kind: "sync" },
      { from: "p2", to: "c2", kind: "sync" },
    ] as unknown as Parameters<typeof placeNodesInLayers>[0]["edges"];
    const forced = place(nodesByLayer, { edges });
    const free = place(nodesByLayer, { edges, forcedLayers: null });

    // Forced layering keeps declaration order (Q11).
    expect(forced.placements.get("c2")!.x).toBeLessThan(forced.placements.get("c1")!.x);
    // Unforced, the children line up under their parents.
    expect(free.placements.get("c1")!.x).toBeLessThan(free.placements.get("c2")!.x);
  });

  it("reserves room above a band's first layer for its frame title", () => {
    const nodesByLayer = new Map([[0, ["a"]]]);
    const plain = place(nodesByLayer);
    const banded = place(nodesByLayer, { groupStartLayer: new Map([[0, "g"]]) });
    expect(banded.placements.get("a")!.y - plain.placements.get("a")!.y).toBe(GAPS.groupTitleGap);
  });
});

describe("placeNodesInLayers > width budget (#2593)", () => {
  const GAPS = { layerGap: 120, nodeGap: 60, maxLayerWidth: 1200, groupTitleGap: 60 };

  function place(nodesByLayer: Map<number, string[]>, widthBudget: number, cardWidth = 340) {
    return placeNodesInLayers({
      sortedLayers: [...nodesByLayer.keys()].sort((a, b) => a - b),
      nodesByLayer,
      edges: [],
      edgeDirections: undefined,
      layers: new Map(),
      forcedLayers: new Map(),
      layoutHints: undefined,
      gridHint: undefined,
      groupStartLayer: new Map(),
      gaps: GAPS,
      widthBudget,
      measure: () => ({ width: cardWidth, height: 80 }),
    });
  }

  const layerOf = (n: number) => new Map([[0, Array.from({ length: n }, (_n, i) => `n${i}`)]]);
  const BUDGETS = [1200, 1412, 1662, 1956, 2302, 2709, 3189, 3753, 4417, 5198, 6118, 7200];

  it("is NOT monotone in the budget once card heights differ", () => {
    // Pinned as a counterexample, not as a property. A row is as tall as its
    // tallest card, so widening the budget can pull a tall card up into a
    // shorter row and make the canvas taller. An earlier revision of the
    // search stopped scanning candidates on the strength of the opposite
    // assumption; this fixture is what disproves it, and it fails loudly if
    // anyone reinstates the shortcut.
    const heights = [282, 361, 384, 169, 445, 281, 423];
    const widths = [264, 439, 496, 492, 442, 403, 176];
    const ids = heights.map((_h, i) => `n${i}`);
    const placeUneven = (widthBudget: number) =>
      placeNodesInLayers({
        sortedLayers: [0],
        nodesByLayer: new Map([[0, ids]]),
        edges: [],
        edgeDirections: undefined,
        layers: new Map(),
        forcedLayers: new Map(),
        layoutHints: undefined,
        gridHint: undefined,
        groupStartLayer: new Map(),
        gaps: GAPS,
        widthBudget,
        measure: (id: string) => {
          const i = ids.indexOf(id);
          return { width: widths[i], height: heights[i] };
        },
      });

    expect(placeUneven(1412).childMaxHeight).toBeGreaterThan(placeUneven(1200).childMaxHeight);
  });

  it("is monotone in the budget when every card is the same height", () => {
    // The intuition behind the discarded shortcut, kept to show exactly how
    // far it does hold: uniform cards never make a row taller.
    for (const n of [4, 7, 12, 18, 30]) {
      const measured = BUDGETS.map((budget) => place(layerOf(n), budget));
      for (let i = 1; i < measured.length; i++) {
        expect(measured[i].childMaxWidth).toBeGreaterThanOrEqual(measured[i - 1].childMaxWidth);
        expect(measured[i].childMaxHeight).toBeLessThanOrEqual(measured[i - 1].childMaxHeight);
      }
    }
  });

  it("keeps ADR-1737's column rule whatever the budget is", () => {
    // A widened budget must not turn a small sibling set into one long row:
    // `gridColumnCount` puts 7 siblings on 3 columns, and no budget may raise
    // that to 7 — the 7±2 span-of-control bound is not the search's to spend.
    for (const budget of BUDGETS) {
      const rows = new Set([...place(layerOf(7), budget).placements.values()].map((p) => p.y));
      expect(rows.size).toBe(3);
    }
  });

  it("reports whether the width bound was the binding constraint", () => {
    // Three 340-wide cards fit in 1200 (340*3 + 60*2 = 1140), so the only
    // breaks come from the column count.
    expect(place(layerOf(3), 1200).widthBound).toBe(false);
    // Nine of them do not: `gridColumnCount(9)` allows 3 per row, and 3 fit, so
    // still no width break...
    expect(place(layerOf(9), 1200).widthBound).toBe(false);
    // ...but at 4 columns (16 nodes) a row of 4 needs 1540 > 1200, so the width
    // bound cuts the rows short and widening can still change the placement.
    expect(place(layerOf(16), 1200).widthBound).toBe(true);
    expect(place(layerOf(16), 2302).widthBound).toBe(false);
  });
});
