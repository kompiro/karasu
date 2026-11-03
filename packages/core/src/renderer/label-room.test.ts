import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractView } from "../view/view-extract.js";
import { compile } from "../compile/compile.js";
import type { EdgeDirection } from "../types/style.js";
import { layout } from "./layout.js";
import { withheldLabelsOf } from "./edge-layer.js";
import { resolvePalette } from "./palette.js";
import { chooseLabelRoom, labelRoomInChannels, labelRoomInRows } from "./label-room.js";
import type { LayoutNode, LayoutOptions, LayoutResult, WithheldLabel } from "./layout-types.js";

// Label room (#3036): the room `layout()` opens for the labels the renderer's
// pass could not seat. TPL-3036: a room another kind of user (routing) can
// take is kept only where the placement with it was measured to seat more, so
// a candidate never displaces the baseline unless it is strictly better
// (TPL-2593), and a view with nothing withheld is laid out exactly as before.

const here = dirname(fileURLToPath(import.meta.url));
const DENSE = readFileSync(resolve(here, "fixtures/dense-domain-canvas.krs"), "utf8");
const DENSE_PATH = ["Umami", "UmamiApp"];

/** Lays out the dense fixture's drill-down, with or without the renderer's label pass. */
function denseLayout(withheld: "renderer" | "none" | "empty"): LayoutResult {
  const parsed = Parser.parse(DENSE);
  const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
  const palette = resolvePalette();
  const options: LayoutOptions = {
    ownerIndex: parsed.value.ownerIndex,
    layoutHints: styles.layoutHints,
    edgeDirections: new Map<string, EdgeDirection>(),
  };
  if (withheld === "renderer") {
    options.withheldLabels = (r) => withheldLabelsOf(r, styles, palette);
  } else if (withheld === "empty") {
    options.withheldLabels = () => [];
  }
  return layout(extractView(parsed.value.systems, DENSE_PATH), options);
}

/** Labels a compiled SVG draws on the canvas, and how many it carries in all. */
function drawnLabels(svg: string): { drawn: number; total: number } {
  const groups = svg.match(/<g [^>]*data-edge-label="[^"]*"[^>]*>/g) ?? [];
  const deferred = groups.filter((g) => g.includes('data-edge-label-withheld="deferred"'));
  return { drawn: groups.length - deferred.length, total: groups.length };
}

describe("the dense fixture opens room for its withheld labels (#3036)", () => {
  it("seats at least 30 of its 41 labels, up from 17", () => {
    const { drawn, total } = drawnLabels(compile(DENSE, { viewPath: DENSE_PATH }).svg);
    expect(total).toBe(41);
    expect(drawn).toBeGreaterThanOrEqual(30);
  });

  it("keeps candidate B, which opens the gaps inside rows as well as the channels", () => {
    const result = denseLayout("renderer");
    expect(result.labelRoom).toBe("channels+rows");
    // The search's winner, then candidates A and B: no channel, column or side
    // ran short on the first placement, so there is no structural pass.
    expect(result.placementPasses).toBe(3);
  });

  it("without the renderer's label pass, `layout()` tries no candidate", () => {
    const result = denseLayout("none");
    expect(result.labelRoom).toBeUndefined();
    expect(result.placementPasses).toBeLessThanOrEqual(2);
  });

  it("a label pass that withholds nothing lays the view out exactly as without one", () => {
    const without = denseLayout("none");
    const empty = denseLayout("empty");
    expect(empty.labelRoom).toBeUndefined();
    expect(empty.placementPasses).toBe(without.placementPasses);
    expect(JSON.stringify([...empty.nodes])).toBe(JSON.stringify([...without.nodes]));
    expect(JSON.stringify(empty.edges)).toBe(JSON.stringify(without.edges));
    expect([empty.width, empty.height]).toEqual([without.width, without.height]);
  });
});

// Synthetic placements: two cards side by side in row 0, one card in row 1.
//
//   a [0..100]  gap [100..130]  b [130..230]     y 0..60
//   channel                                       y 60..80
//   c [0..100]                                    y 80..140
const card = (id: string, x: number, y: number): LayoutNode =>
  ({ id, x, y, width: 100, height: 60 }) as LayoutNode;

function placement(cards: LayoutNode[]): LayoutResult {
  return {
    nodes: new Map(cards.map((n) => [n.id, n])),
    edges: [],
    containers: [],
    width: 230,
    height: 140,
  };
}

const ROWS = [["a", "b"], ["c"]];
const FIRST = () => placement([card("a", 0, 0), card("b", 130, 0), card("c", 0, 80)]);
const label = (x: number, y: number, width = 80, height = 18): WithheldLabel => ({
  anchor: { x, y },
  width,
  height,
});

describe("labelRoomInRows: the widest withheld label in a gap, plus its margins", () => {
  it("opens a gap before its right-hand card by what the widest label is short of", () => {
    const room = labelRoomInRows(FIRST(), ROWS, [label(115, 30), label(115, 40, 60)]);
    // 80 + 8 × 2 = 96 across a 30 px gap.
    expect(room).toEqual(new Map([[0, new Map([["b", 66]])]]));
  });

  it("opens nothing for a label outside every gap between two cards of a row", () => {
    // In the channel, beyond the row's outer edge, and inside a row of one card.
    const withheld = [label(115, 70), label(260, 30), label(50, 110)];
    expect(labelRoomInRows(FIRST(), ROWS, withheld).size).toBe(0);
  });

  it("opens nothing where the label already fits the gap", () => {
    expect(labelRoomInRows(FIRST(), ROWS, [label(115, 30, 10)]).size).toBe(0);
  });
});

describe("labelRoomInChannels: the largest sum of label heights over any x", () => {
  it("stacks labels of different font sizes that overlap in x", () => {
    const room = labelRoomInChannels(FIRST(), ROWS, undefined, [
      label(50, 70, 80, 16),
      label(60, 70, 80, 24),
    ]);
    // (16 + 2 × 2) + (24 + 2 × 2) over the 20 px channel between rows 0 and 1.
    expect(room).toEqual(new Map([[1, { height: 48, gap: 20 }]]));
  });

  it("lets labels side by side share the height", () => {
    const room = labelRoomInChannels(FIRST(), ROWS, undefined, [
      label(40, 70, 60, 16),
      label(180, 70, 60, 24),
    ]);
    expect(room.get(1)?.height).toBe(28);
  });

  it("measures nothing for a label inside a row", () => {
    expect(labelRoomInChannels(FIRST(), ROWS, undefined, [label(115, 30)]).size).toBe(0);
  });
});

describe("chooseLabelRoom keeps a candidate only when it seats strictly more (TPL-2593)", () => {
  /**
   * Runs the chooser over the synthetic first placement, with one withheld
   * label in the row gap and one in the channel (so both candidates are made),
   * and the counts the label pass reports on each candidate.
   */
  function choose(counts: { first: number; a: number; b: number }) {
    const first = { result: FIRST(), rows: ROWS, crossingMarksPending: false };
    // On the first placement: a label in the row gap, one in the channel, and
    // copies of the first up to the count. On a candidate: just the count.
    const demand = [label(115, 30), label(50, 70), label(115, 30), label(115, 30), label(115, 30)];
    const withheldOn = new Map<LayoutResult, number>();
    const placed: string[] = [];
    const chosen = chooseLabelRoom({
      first,
      structural: undefined,
      reservations: new Map(),
      columns: new Map(),
      options: {
        withheldLabels: (result) =>
          result === first.result
            ? demand.slice(0, counts.first)
            : demand.slice(0, withheldOn.get(result)),
      },
      place: (_rows, columns) => {
        const kind = columns.size > 0 ? "b" : "a";
        placed.push(kind);
        const run = { result: FIRST(), rows: ROWS, crossingMarksPending: false };
        withheldOn.set(run.result, counts[kind]);
        return run;
      },
    });
    return { chosen, placed, first };
  }

  it("places A, then B, and keeps the one that withholds fewest", () => {
    const { chosen, placed } = choose({ first: 5, a: 3, b: 1 });
    expect(placed).toEqual(["a", "b"]);
    expect(chosen.labelRoom).toBe("channels+rows");
    expect(chosen.passes).toBe(3);
  });

  it("keeps A when B withholds more than A", () => {
    expect(choose({ first: 5, a: 3, b: 7 }).chosen.labelRoom).toBe("channels");
  });

  it("keeps A when B only ties it", () => {
    expect(choose({ first: 5, a: 3, b: 3 }).chosen.labelRoom).toBe("channels");
  });

  it("returns the baseline when no candidate withholds fewer than it", () => {
    const { chosen, first } = choose({ first: 5, a: 5, b: 6 });
    expect(chosen.run).toBe(first);
    expect(chosen.labelRoom).toBeUndefined();
    // The candidates were still placed and measured.
    expect(chosen.passes).toBe(3);
  });

  it("places nothing when the label pass withholds nothing", () => {
    const { chosen, placed, first } = choose({ first: 0, a: 0, b: 0 });
    expect(placed).toEqual([]);
    expect(chosen.run).toBe(first);
    expect(chosen.passes).toBe(1);
  });
});
