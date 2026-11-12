/**
 * The `column` hint overrides automatic placement on every canvas the logical
 * view lays out (ADR-969, `docs/spec/style.md` § `column`; TPL-1761 item 4).
 *
 * Enumerated rather than sampled, so a new value or a new canvas is measured
 * the day it appears:
 *
 * - every value `PROPERTY_SCHEMAS.column` accepts. `EXPECTED` is a
 *   `Record<LayoutColumn, …>`, so a value added to the type needs an expectation
 *   here, and a value added to the schema alone fails the drift check;
 * - every canvas: each kind in `REFERENCE_DATA.nodeKinds` that contains
 *   children, holding three cards of each kind it may contain;
 * - on the system canvas, with and without `[external]` and with and without
 *   two consuming hubs. The hubs engage the side columns (#1728), whose auto
 *   assignment is the other placement `column` has to override;
 * - both pipelines: one system's own canvas and the multi-system root.
 *
 * Each case is built so the automatic placement puts the hinted card where the
 * hint must move it from: `left` is declared last and consumed from the right,
 * `right` is declared first and consumed from the left. The unhinted layout of
 * the same source is checked to fail the expectation, so a case cannot pass
 * by already being where the hint asks.
 */
import { describe, expect, it } from "vitest";
import { REFERENCE_DATA } from "../builtins/reference-data.js";
import { PROPERTY_SCHEMAS } from "../style/property-schema.js";
import { layoutView } from "./fixtures/layout-corpus.js";
import type { LayoutColumn, ResolvedLayoutHints } from "../types/style.js";
import type { LayoutNode, LayoutResult } from "./layout-types.js";

const TOLERANCE = 0.5;

/**
 * Kinds that `canContain` lists but that are not drawn as cards on their
 * parent's canvas, so there is nothing for `column` to order. The check below
 * fails if one of them starts being drawn there.
 */
const NOT_ON_PARENT_CANVAS: Record<string, string> = {
  entity: "drawn on the domain's entity (ER) view, not as cards on the domain canvas",
};

/** Kinds declared with a keyword other than their name (`docs/spec/syntax.md`). */
const KEYWORD: Record<string, string> = { "queue-item": "queue" };

type Order = "hinted-first" | "hinted-last";
type Expectation =
  | { order: Order; hub: "left" | "right"; holds: (b: LayoutNode, peers: LayoutNode[]) => boolean }
  | "same-as-unhinted";

const EXPECTED: Record<LayoutColumn, Expectation> = {
  left: {
    order: "hinted-last",
    hub: "right",
    holds: (b, peers) => peers.every((p) => b.x < p.x - TOLERANCE),
  },
  right: {
    order: "hinted-first",
    hub: "left",
    holds: (b, peers) => peers.every((p) => b.x + b.width > p.x + p.width + TOLERANCE),
  },
  // `center` is the middle bucket, which unspecified nodes share (style.md).
  center: "same-as-unhinted",
};

interface Canvas {
  name: string;
  /** Kind chain from `system` down to the canvas's own kind. */
  chain: string[];
  kind: string;
  tags: string[];
  hubs: boolean;
  multi: boolean;
}

/** Each kind's parent on the shortest containment chain from `system`. */
function containmentChains(): Map<string, string[]> {
  const chains = new Map<string, string[]>([["system", ["system"]]]);
  const queue = ["system"];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const spec = REFERENCE_DATA.nodeKinds.find((k) => k.kind === parent)!;
    for (const child of spec.canContain) {
      if (chains.has(child)) continue;
      chains.set(child, [...chains.get(parent)!, child]);
      queue.push(child);
    }
  }
  return chains;
}

function canvases(): Canvas[] {
  const chains = containmentChains();
  const out: Canvas[] = [];
  for (const parent of REFERENCE_DATA.nodeKinds) {
    const chain = chains.get(parent.kind);
    if (!chain || parent.canContain.length === 0) continue;
    for (const kind of parent.canContain) {
      const onSystem = parent.kind === "system";
      for (const tags of onSystem ? [[], ["external"]] : [[]]) {
        for (const hubs of onSystem ? [false, true] : [false]) {
          for (const multi of onSystem ? [false, true] : [false]) {
            const name = `${parent.kind} > ${kind}${tags.map((t) => ` [${t}]`).join("")}${hubs ? ", two hubs" : ""}${multi ? ", multi-system root" : ""}`;
            out.push({ name, chain, kind, tags, hubs, multi });
          }
        }
      }
    }
  }
  return out;
}

function sourceOf(c: Canvas, order: Order, hub: "left" | "right"): { src: string; path: string[] } {
  const ids = order === "hinted-first" ? ["B", "A", "C"] : ["A", "C", "B"];
  const keyword = KEYWORD[c.kind] ?? c.kind;
  const tag = c.tags.map((t) => ` [${t}]`).join("");
  const lines = ids.map((id) => `${keyword} ${id}${tag} { label "Card ${id}" }`);
  if (c.hubs) {
    const consumer = hub === "left" ? "HubLeft" : "HubRight";
    lines.unshift(`service HubLeft {}`, `service HubRight {}`);
    lines.push(...ids.map((id) => `${consumer} -> ${id}`));
  }
  let src = lines.join("\n");
  for (let i = c.chain.length - 1; i >= 0; i--) {
    src = `${c.chain[i]} ${c.chain[i]}X {\n${src}\n}`;
  }
  if (c.multi) src += `\nsystem Other {\n  service O {}\n}\n`;
  const path = c.chain.map((k) => `${k}X`);
  return { src, path: c.multi || path.length === 1 ? [] : path };
}

function cardsOf(res: LayoutResult): Map<string, LayoutNode> {
  const out = new Map<string, LayoutNode>();
  for (const n of res.nodes.values()) {
    if (!n.ghost && ["A", "B", "C"].includes(n.id)) out.set(n.id, n);
  }
  return out;
}

const place = (src: string, path: string[], hint?: LayoutColumn) =>
  layoutView(src, path, {
    layoutHints: new Map<string, ResolvedLayoutHints>(hint ? [["B", { column: hint }]] : []),
  });

/**
 * What the hint did on one canvas, next to what it should have done. `center`
 * compares every card against the unhinted layout; `left` / `right` check the
 * expectation holds with the hint and fails without it.
 */
function observe(c: Canvas, value: LayoutColumn, expectation: Expectation) {
  if (expectation === "same-as-unhinted") {
    const coords = (r: LayoutResult) =>
      [...r.nodes.values()].map((n) => [n.id, n.x, n.y, n.width, n.height]);
    const runs = (["hinted-first", "hinted-last"] as const).flatMap((order) =>
      (["left", "right"] as const).map((hub) => sourceOf(c, order, hub)),
    );
    return {
      actual: runs.map(({ src, path }) => coords(place(src, path, value))),
      expected: runs.map(({ src, path }) => coords(place(src, path))),
    };
  }
  const { src, path } = sourceOf(c, expectation.order, expectation.hub);
  const hinted = cardsOf(place(src, path, value));
  const unhinted = cardsOf(place(src, path));
  const peers = (m: Map<string, LayoutNode>) => [m.get("A")!, m.get("C")!];
  return {
    actual: {
      unhinted: expectation.holds(unhinted.get("B")!, peers(unhinted)),
      hinted: expectation.holds(hinted.get("B")!, peers(hinted)),
    },
    expected: { unhinted: false, hinted: true },
  };
}

const CANVASES = canvases();

describe("column hint: the expectations cover the schema (TPL-1761 item 4)", () => {
  it("names exactly the values PROPERTY_SCHEMAS.column accepts", () => {
    const schema = PROPERTY_SCHEMAS.column;
    expect(schema.kind).toBe("ident-of");
    const values = schema.kind === "ident-of" ? [...schema.values] : [];
    expect(Object.keys(EXPECTED).sort()).toEqual(values.sort());
  });

  it("every contained kind is drawn on its parent's canvas unless exempted", () => {
    const drawn = (c: Canvas) => {
      const { src, path } = sourceOf(c, "hinted-last", "right");
      return cardsOf(place(src, path)).size === 3;
    };
    const wrong = CANVASES.filter((c) => drawn(c) === c.kind in NOT_ON_PARENT_CANVAS).map(
      (c) => c.name,
    );
    expect(wrong).toEqual([]);
  });
});

describe.each(Object.entries(EXPECTED) as [LayoutColumn, Expectation][])(
  "column: %s overrides the automatic placement (TPL-1761 item 4)",
  (value, expectation) => {
    const cases = CANVASES.filter((c) => !(c.kind in NOT_ON_PARENT_CANVAS));

    it.each(cases)("$name", (c) => {
      const { actual, expected } = observe(c, value, expectation);
      expect(actual).toEqual(expected);
    });
  },
);
