/**
 * Placement invariants of the `[external]` side columns (#1728, TPL-1761),
 * measured on the final layout rather than inside the post-pass.
 *
 * The unit tests in `external-columns.test.ts` hold the post-pass to the cases
 * it was written for. These hold *every* canvas to what the reader sees, so a
 * new pass that moves a card, a new caller of the side placement, or a change
 * in how a frame is grown is measured the same way the existing ones are:
 *
 * - no two cards overlap (TPL-1761 item 5: the `count + 1` equal split that
 *   stacked dify's 14 externals into each other, #2625)
 * - every card sits inside its own frame and inside the canvas (items 6, 11)
 * - a frame grows only by what a column that does not fit needs (item 6)
 * - the cards that are not external keep their rows and x-spans (item 1, for
 *   the external kind only: a pass that bands some other kind is not measured)
 *
 * Inputs are the whole `examples/` corpus plus a generated sweep over the
 * external count (columns that fit and columns that overflow) and the number
 * of consuming hubs (below and above the ≥2-hub gate), each laid out by both
 * pipelines: one system's own canvas (`layout.ts`) and the multi-system root
 * (`layout-multi-system.ts`).
 */
import { describe, expect, it, vi } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { systemTier } from "./layer-assignment.js";
import { CONTAINER_PADDING } from "./layout-constants.js";
import { corpusViews, layoutView } from "./fixtures/layout-corpus.js";
import type { KrsNode } from "../types/ast.js";
import type { LayoutNode, LayoutResult } from "./layout-types.js";

// Wrap, do not replace: every layout below runs the real side placement. The
// wrapper records which cards it moved, and can switch it off so a frame can
// be compared with the frame the same model gets without side columns.
const siding = vi.hoisted(() => ({ off: false, moved: new Set<string>() }));
vi.mock("./external-columns.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./external-columns.js")>();
  return {
    ...actual,
    placeExternalServicesOnSides: (
      ...args: Parameters<typeof actual.placeExternalServicesOnSides>
    ) => {
      if (siding.off) return new Map<string, "left" | "right">();
      const sides = actual.placeExternalServicesOnSides(...args);
      for (const id of sides.keys()) siding.moved.add(id);
      return sides;
    },
  };
});

const TOLERANCE = 0.5;

/**
 * The clearance two cards of one side column keep (#2625). Held here as the
 * requirement rather than read from `EXTERNAL_STACK_GAP`, so lowering that
 * constant toward touching cards fails this file instead of moving its bar.
 */
const COLUMN_CLEARANCE = 24;

/** The system a card is drawn in: its path's first segment. */
const systemOf = (n: LayoutNode): string | undefined => n.path?.[0];

const realCards = (res: LayoutResult): LayoutNode[] =>
  [...res.nodes.values()].filter((n) => !n.ghost);

const isExternalTier = (n: LayoutNode): boolean =>
  systemTier({ kind: n.kind, tags: n.tags ?? [] } as unknown as KrsNode) === 4;

/** Every pair of cards whose boxes share area. */
function overlaps(res: LayoutResult): string[] {
  const cards = realCards(res);
  const out: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (w > TOLERANCE && h > TOLERANCE) out.push(`${a.id} overlaps ${b.id}`);
    }
  }
  return out;
}

/**
 * Cards drawn outside the canvas, or outside the frame of the container they
 * belong to. A single system's own canvas draws no frame for it, so there the
 * canvas is the frame.
 */
function strays(res: LayoutResult): string[] {
  const out: string[] = [];
  const inside = (n: LayoutNode, r: { x: number; y: number; width: number; height: number }) =>
    n.x >= r.x - TOLERANCE &&
    n.y >= r.y - TOLERANCE &&
    n.x + n.width <= r.x + r.width + TOLERANCE &&
    n.y + n.height <= r.y + r.height + TOLERANCE;
  for (const n of realCards(res)) {
    if (!inside(n, { x: 0, y: 0, width: res.width, height: res.height })) {
      out.push(`${n.id} is outside the canvas`);
    }
    if (!n.path) continue;
    const parent = n.path.slice(0, -1).join("\0");
    const frame = res.containers.find((c) => !c.ghost && !c.group && c.path?.join("\0") === parent);
    if (frame && !inside(n, frame)) out.push(`${n.id} is outside its frame ${frame.id}`);
  }
  return out;
}

/** Two hubs or more engage the side columns (#1728); one keeps the bottom band. */
function sweepModel(externals: number, hubs: number, multi: boolean) {
  const hubIds = Array.from({ length: hubs }, (_h, i) => `Hub${i}`);
  const lines = [
    "  user Customer [human]",
    "  client App [web]",
    ...hubIds.map((h) => `  service ${h} { label "Hub service ${h}" }`),
    "  database Store {}",
    "  Customer -> App",
    ...hubIds.map((h) => `  App -> ${h}`),
    "  Hub0 -> Store",
  ];
  for (let i = 0; i < externals; i++) {
    // Labels of different lengths, so a column holds cards of different widths.
    lines.push(`  service Ext${i} [external] { label "Vendor ${"x".repeat(i % 4)}${i}" }`);
    lines.push(`  ${hubIds[i % hubs]} -> Ext${i}`);
  }
  const own = `system S {\n${lines.join("\n")}\n}\n`;
  return multi ? `${own}system T {\n  service Other {}\n}\n` : own;
}

interface SweepCase {
  name: string;
  externals: number;
  hubs: number;
  multi: boolean;
}

const SWEEP: SweepCase[] = [false, true].flatMap((multi) =>
  [1, 2, 3].flatMap((hubs) =>
    [1, 2, 3, 4, 6, 10, 14, 20].map((externals) => ({
      name: `${multi ? "multi-system root" : "single system"}, ${hubs} hub(s), ${externals} external(s)`,
      externals,
      hubs,
      multi,
    })),
  ),
);

const sweepLayout = (c: SweepCase): LayoutResult =>
  layoutView(sweepModel(c.externals, c.hubs, c.multi));

/**
 * Every corpus view, laid out ungrouped: group-by mode skips the side columns
 * and places externals in their group's frame, so the grouped canvases have
 * nothing for these checks to measure.
 */
const CORPUS = corpusViews();

/**
 * Adjacent cards of one side column that sit closer than the column's
 * clearance. Overlap alone is not the item: two cards that touch (gap 0) read
 * as one block, which is the failure the clearance exists to prevent.
 */
function crowdedPairs(res: LayoutResult, moved: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const bySystem = new Map<string | undefined, LayoutNode[]>();
  for (const n of realCards(res)) {
    bySystem.set(systemOf(n), [...(bySystem.get(systemOf(n)) ?? []), n]);
  }
  for (const cards of bySystem.values()) {
    const band = cards.filter((n) => !moved.has(n.id));
    const column = cards.filter((n) => moved.has(n.id));
    if (band.length === 0 || column.length === 0) continue;
    const bandLeft = Math.min(...band.map((n) => n.x));
    for (const onLeft of [true, false]) {
      const side = column.filter((n) => n.x < bandLeft === onLeft).sort((a, b) => a.y - b.y);
      for (let i = 1; i < side.length; i++) {
        const gap = side[i].y - (side[i - 1].y + side[i - 1].height);
        if (gap < COLUMN_CLEARANCE - TOLERANCE) {
          out.push(`${side[i - 1].id} and ${side[i].id} are ${gap}px apart`);
        }
      }
    }
  }
  return out;
}

/** Lays out one view and returns the cards the side placement moved in it. */
function layoutRecordingSides(src: string, path: string[]) {
  siding.moved.clear();
  const res = layoutView(src, path);
  return { res, moved: new Set(siding.moved) };
}

describe("side columns: no card overlaps another (TPL-1761 item 5)", () => {
  it.each(SWEEP)("$name", (c) => {
    const { res, moved } = layoutRecordingSides(sweepModel(c.externals, c.hubs, c.multi), []);
    expect([...overlaps(res), ...crowdedPairs(res, moved)]).toEqual([]);
  });

  it("holds on every example canvas", () => {
    const found = CORPUS.flatMap((v) => {
      const { res, moved } = layoutRecordingSides(v.src, v.path);
      return [...overlaps(res), ...crowdedPairs(res, moved)].map((o) => `${v.name}: ${o}`);
    });
    expect(found).toEqual([]);
  });

  it("the sweep reaches both columns that fit and columns that overflow", () => {
    // Without a column too tall for the band the overlap check above would pass
    // on the equal-step spread that caused #2625, which only breaks once the
    // cards no longer fit. Measured by demand (the cards' summed height against
    // the band they hug), not by where the cards ended up, so a regression to
    // that spread cannot make the sweep look like it never overflowed.
    let fits = 0;
    let overflows = 0;
    for (const c of SWEEP) {
      siding.moved.clear();
      const cards = realCards(sweepLayout(c)).filter((n) => systemOf(n) === "S");
      const band = cards.filter((n) => !siding.moved.has(n.id));
      const span = Math.max(...band.map((n) => n.y + n.height)) - Math.min(...band.map((n) => n.y));
      const bandLeft = Math.min(...band.map((n) => n.x));
      const column = cards.filter((n) => siding.moved.has(n.id));
      for (const side of [true, false]) {
        const members = column.filter((n) => n.x < bandLeft === side);
        if (members.length === 0) continue;
        if (members.reduce((sum, n) => sum + n.height, 0) > span) overflows++;
        else fits++;
      }
    }
    expect(fits).toBeGreaterThan(0);
    expect(overflows).toBeGreaterThan(0);
  });
});

describe("side columns: every card stays inside its frame and the canvas (TPL-1761 items 6, 11)", () => {
  it.each(SWEEP)("$name", (c) => {
    expect(strays(sweepLayout(c))).toEqual([]);
  });

  it("holds on every example canvas", () => {
    const found = CORPUS.flatMap((v) =>
      strays(layoutView(v.src, v.path)).map((s) => `${v.name}: ${s}`),
    );
    expect(found).toEqual([]);
  });
});

/** A frame's vertical extent, relative to the top of the cards that stay in the band. */
function extentOf(res: LayoutResult, sys: string, band: LayoutNode[]) {
  const top = Math.min(...band.map((n) => n.y));
  const frame = res.containers.find((c) => c.id === sys && !c.group && !c.ghost);
  // One system's own canvas has no frame of its own: the canvas is its frame.
  const rect = frame ?? { y: 0, height: res.height };
  return { top: rect.y - top, bottom: rect.y + rect.height - top };
}

describe("side columns: a frame grows only by what an overflowing column needs (TPL-1761 item 6)", () => {
  // The reference is the same model laid out with the side placement switched
  // off, where the externals sit in the bottom band. With the columns on, the
  // frame may reach past that only to wrap a column card (plus the frame's
  // padding); a column that fits inside the band leaves the frame where it was.
  //
  // Compared only where both runs placed once at the same width budget: a
  // second placement pass reserves channel room from the routed edges, and the
  // edges to a side column are routed differently from the edges to a bottom
  // band, so that room differs for reasons that are not the frame growth.
  function compare(src: string, path: string[]): { compared: number; offenders: string[] } {
    siding.moved.clear();
    const on = layoutView(src, path);
    const moved = new Set(siding.moved);
    siding.off = true;
    let off: LayoutResult;
    try {
      off = layoutView(src, path);
    } finally {
      siding.off = false;
    }
    if (moved.size === 0) return { compared: 0, offenders: [] };
    if (on.placementPasses !== 1 || off.placementPasses !== 1)
      return { compared: 0, offenders: [] };
    if (on.widthBudget !== off.widthBudget) return { compared: 0, offenders: [] };
    const offenders: string[] = [];
    const systems = new Set(realCards(on).flatMap((n) => (moved.has(n.id) ? [systemOf(n)] : [])));
    for (const sys of systems) {
      if (sys === undefined) continue;
      const inSys = (r: LayoutResult) => realCards(r).filter((n) => systemOf(n) === sys);
      const bandOn = inSys(on).filter((n) => !isExternalTier(n));
      const bandOff = inSys(off).filter((n) => !isExternalTier(n));
      const top = Math.min(...bandOn.map((n) => n.y));
      const column = inSys(on).filter((n) => moved.has(n.id));
      const reach = {
        top: Math.min(...column.map((n) => n.y)) - CONTAINER_PADDING - top,
        bottom: Math.max(...column.map((n) => n.y + n.height)) + CONTAINER_PADDING - top,
      };
      const a = extentOf(on, sys, bandOn);
      const b = extentOf(off, sys, bandOff);
      if (a.top < Math.min(b.top, reach.top) - TOLERANCE) {
        offenders.push(`${sys}: frame top ${a.top} above ${Math.min(b.top, reach.top)}`);
      }
      if (a.bottom > Math.max(b.bottom, reach.bottom) + TOLERANCE) {
        offenders.push(
          `${sys}: frame bottom ${a.bottom} below ${Math.max(b.bottom, reach.bottom)}`,
        );
      }
    }
    return { compared: systems.size, offenders };
  }

  it("holds across the sweep and the corpus", () => {
    let compared = 0;
    const offenders: string[] = [];
    for (const c of SWEEP) {
      const r = compare(sweepModel(c.externals, c.hubs, c.multi), []);
      compared += r.compared;
      offenders.push(...r.offenders.map((o) => `${c.name}: ${o}`));
    }
    for (const v of CORPUS) {
      const r = compare(v.src, v.path);
      compared += r.compared;
      offenders.push(...r.offenders.map((o) => `${v.name}: ${o}`));
    }
    expect(offenders).toEqual([]);
    // Non-vacuity: the comparison has to have run on side columns at all.
    expect(compared).toBeGreaterThanOrEqual(10);
  });
});

/**
 * Rows (cards sharing a y, in x order) and x-spans relative to the leftmost
 * card, of the cards of one system that are not external.
 */
function bandShape(res: LayoutResult, sys: string) {
  const cards = realCards(res).filter((n) => systemOf(n) === sys && !isExternalTier(n));
  const left = Math.min(...cards.map((n) => n.x));
  const rows = new Map<number, LayoutNode[]>();
  for (const n of cards) {
    const key = Math.round(n.y);
    rows.set(key, [...(rows.get(key) ?? []), n]);
  }
  return {
    rows: [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((n) => n.id)),
    spans: Object.fromEntries(
      cards.map((n) => [n.id, [Math.round(n.x - left), Math.round(n.width)]]),
    ),
  };
}

/** The same source with every external-tier system child, and every edge touching one, removed. */
function withoutExternals(src: string): { systems: KrsNode[]; removed: number } {
  const systems = Parser.parse(src).value.systems;
  // Keyed per system: two systems may both declare `Stripe`, one as an
  // external and one as their own service, and only the external goes.
  const removed = new Map<string, Set<string>>();
  for (const sys of systems) {
    const ids = new Set(sys.children.filter((c) => systemTier(c) === 4).map((c) => c.id));
    removed.set(sys.id, ids);
    sys.children = sys.children.filter((child) => !ids.has(child.id));
  }
  // A bare endpoint resolves in its own system; a dotted one names the system.
  const touches = (end: string, own: string) =>
    removed.get(own)!.has(end) ||
    [...removed].some(([sys, ids]) => [...ids].some((id) => end === `${sys}.${id}`));
  const prune = (n: KrsNode, own: string): void => {
    n.edges = n.edges.filter((e) => !touches(e.from, own) && !touches(e.to, own));
    for (const child of n.children) prune(child, own);
  };
  for (const sys of systems) prune(sys, sys.id);
  return { systems, removed: [...removed.values()].reduce((sum, ids) => sum + ids.size, 0) };
}

describe("side columns: the other kinds keep their rows and x-spans (TPL-1761 item 1, externals only)", () => {
  // Wherever the externals go (a side column, or the bottom band below the
  // single-hub gate), the cards of every other kind are placed as if the
  // externals were not in the model at all.
  function compare(src: string, path: string[]): string[] | null {
    const parsed = Parser.parse(src).value;
    const stripped = withoutExternals(src);
    if (stripped.removed === 0) return null;
    // The same options `layoutView` passes, so both runs see what the other
    // guards in this file see; only the systems differ.
    const options = {
      ownerIndex: parsed.ownerIndex,
      boundaryMembership: parsed.boundaryMembership,
    };
    const withExt = layout(extractView(parsed.systems, path), options);
    const without = layout(extractView(stripped.systems, path), options);
    const systems = new Set(realCards(withExt).map(systemOf));
    const out: string[] = [];
    for (const sys of systems) {
      if (sys === undefined) continue;
      const a = bandShape(withExt, sys);
      const b = bandShape(without, sys);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.push(`${sys}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      }
    }
    return out;
  }

  it.each(SWEEP)("$name", (c) => {
    expect(compare(sweepModel(c.externals, c.hubs, c.multi), [])).toEqual([]);
  });

  it("holds on every example canvas that has an external", () => {
    // Drill-downs are left out: their canvas is a service's, not the tiers'.
    const results = CORPUS.filter((v) => v.path.length <= 1).map((v) => ({
      v,
      found: compare(v.src, v.path),
    }));
    expect(results.filter((r) => r.found !== null).length).toBeGreaterThan(0);
    const offenders = results.flatMap(({ v, found }) =>
      (found ?? []).map((o) => `${v.name}: ${o}`),
    );
    expect(offenders).toEqual([]);
  });
});
