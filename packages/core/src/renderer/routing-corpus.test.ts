/**
 * Routing fences over **every view of every example** (TPL-1927).
 *
 * `routing-parity.test.ts` holds the dual metric on models chosen by hand.
 * A hand list fences the shapes it was written for: an example added later, a
 * drill-down level, a deploy view or a Group-by mode nobody listed is not
 * measured, and a new route shape that first appears there goes unnoticed.
 * Here `layout` is wrapped so every canvas the all-views bundle lays out is
 * measured, for every example under `examples/` and every Group-by mode
 * (`GROUP_BY_MODES`, a `Record` over the option's type). A new example, view
 * kind or mode is covered the day it exists (ADR-3038 D4).
 *
 * What is asserted on each canvas:
 *
 * - **every crossing carries a hop mark** (ADR-1859: crossings are neutralised
 *   by representation, not minimised). Measured per crossing, not per canvas:
 *   one marked crossing must not vouch for an unmarked one beside it.
 * - **no edge pierces a card or a frame** it does not belong to. The corpus has
 *   the degenerate canvases too (one frame, no frame under a Group-by mode, no
 *   infra or external), and the last test pins that it still does, so the zero
 *   is measured on them rather than assumed.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LayoutResult } from "./layout-types.js";
import type { Point } from "./edge-geometry.js";
import { categoryOf } from "./category-collapse.js";
import {
  GROUP_BY_MODES,
  loadExampleCorpus,
  renderEveryView,
  type GroupByMode,
} from "./fixtures/example-corpus.js";
import { endpointsOf, pointsOf, totalPenetrations } from "./fixtures/routing-metrics.js";

const laidOut: LayoutResult[] = [];
vi.mock("./layout.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./layout.js")>();
  return {
    ...mod,
    layout: (...args: Parameters<typeof mod.layout>) => {
      const res = mod.layout(...args);
      laidOut.push(res);
      return res;
    },
  };
});
vi.mock("./deploy-layout.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./deploy-layout.js")>();
  return {
    ...mod,
    layoutDeploy: (...args: Parameters<typeof mod.layoutDeploy>) => {
      const res = mod.layoutDeploy(...args);
      laidOut.push(res);
      return res;
    },
  };
});

interface Canvas {
  where: string;
  mode: GroupByMode;
  res: LayoutResult;
}

const canvases: Canvas[] = [];

beforeAll(async () => {
  for (const entry of await loadExampleCorpus()) {
    for (const mode of GROUP_BY_MODES) {
      laidOut.length = 0;
      renderEveryView(entry, mode);
      laidOut.forEach((res, i) =>
        canvases.push({ where: `${entry.name} [${mode}] #${i}`, mode, res }),
      );
    }
  }
}, 120_000);

/**
 * Strict-interior crossings between the edges `computeCrossingMarks` marks
 * (ghost and cyclic edges are peripheral and carry none by design). An
 * independent all-pairs count, so it does not inherit a pair the mark pass's
 * spatial index might skip.
 */
function crossingsOf(res: LayoutResult): { at: Point; edges: [number, number] }[] {
  const segs: { a: Point; b: Point; edge: number }[] = [];
  res.edges.forEach((e, edge) => {
    if (e.ghost || e.cyclic) return;
    const pts = pointsOf(e);
    for (let k = 0; k < pts.length - 1; k++) segs.push({ a: pts[k], b: pts[k + 1], edge });
  });
  const EPS = 1e-6;
  const out: { at: Point; edges: [number, number] }[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      if (s.edge === t.edge) continue;
      const rx = s.b.x - s.a.x;
      const ry = s.b.y - s.a.y;
      const sx = t.b.x - t.a.x;
      const sy = t.b.y - t.a.y;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < EPS) continue;
      const qx = t.a.x - s.a.x;
      const qy = t.a.y - s.a.y;
      const u = (qx * sy - qy * sx) / denom;
      const v = (qx * ry - qy * rx) / denom;
      const len1 = Math.hypot(rx, ry);
      const len2 = Math.hypot(sx, sy);
      // Touching at an endpoint is a join (a trunk elbow, a shared corner), not a crossing.
      if (u * len1 <= EPS || (1 - u) * len1 <= EPS || v * len2 <= EPS || (1 - v) * len2 <= EPS) {
        continue;
      }
      out.push({ at: { x: s.a.x + u * rx, y: s.a.y + u * ry }, edges: [s.edge, t.edge] });
    }
  }
  return out;
}

describe("routing over every view of every example (TPL-1927)", () => {
  it("lays out a corpus that exercises the router in every mode", () => {
    const perMode = GROUP_BY_MODES.map((mode) => {
      const ofMode = canvases.filter((c) => c.mode === mode);
      return {
        mode,
        many: ofMode.length > 100,
        crosses: ofMode.some((c) => crossingsOf(c.res).length > 0),
      };
    });
    expect(perMode).toEqual(GROUP_BY_MODES.map((mode) => ({ mode, many: true, crosses: true })));
  });

  it("every crossing carries a hop mark, so it reads as 'not connected'", () => {
    const unmarked: string[] = [];
    for (const { where, res } of canvases) {
      const hops = res.crossingMarks?.hops ?? [];
      const crossings = crossingsOf(res);
      // Where three or more edges cross at one point, the mark pass keeps one
      // arc there, hosted by whichever edge it chose; that arc marks every pair.
      const pairsAt = new Map<string, number>();
      const spot = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      for (const { at } of crossings) pairsAt.set(spot(at), (pairsAt.get(spot(at)) ?? 0) + 1);
      for (const { at, edges } of crossings) {
        const concurrent = (pairsAt.get(spot(at)) ?? 0) > 1;
        // The arc rides one of the two crossing edges and lies along it: the
        // crossing sits on the arc's axis (no offset across it) and within its
        // half-width along it. A clustered arc spans its crossings, so the
        // half-width is half their spread plus the radius.
        const marked = hops.some((h) => {
          if (!concurrent && !edges.includes(h.edge)) return false;
          const rad = (h.angle * Math.PI) / 180;
          const dx = at.x - h.x;
          const dy = at.y - h.y;
          const along = Math.abs(dx * Math.cos(rad) + dy * Math.sin(rad));
          const across = Math.abs(-dx * Math.sin(rad) + dy * Math.cos(rad));
          return across <= 1e-3 && along <= h.halfWidth + 1e-3;
        });
        if (!marked) {
          const [a, b] = edges.map((k) => `${res.edges[k].from}->${res.edges[k].to}`);
          unmarked.push(`${where}: ${a} x ${b} at (${at.x}, ${at.y})`);
        }
      }
    }
    expect(unmarked).toEqual([]);
  });

  it("no edge pierces a card or a frame it does not belong to", () => {
    // `totalPenetrations` skips an edge whose endpoint it cannot find, so an
    // endpoint spelled in a way `endpointsOf` does not resolve would go
    // unmeasured. None may be.
    const unresolved = canvases.flatMap(({ where, res }) =>
      res.edges
        .filter((e) => !e.ghost && !e.cyclic && endpointsOf(res, e).includes(undefined))
        .map((e) => `${where}: ${e.from}->${e.to}`),
    );
    const pierced = canvases
      .map(({ where, res }) => [where, totalPenetrations(res)] as const)
      .filter(([, n]) => n > 0);
    expect({ unresolved, pierced }).toEqual({ unresolved: [], pierced: [] });
  });

  it("the corpus holds the degenerate canvases, so the zero above covers them", () => {
    const routes = (c: Canvas) => c.res.edges.some((e) => !e.ghost && !e.cyclic);
    const frames = (c: Canvas) => c.res.containers.filter((r) => r.group).length;
    const grouped = canvases.filter((c) => c.mode !== "none" && routes(c));
    expect(
      grouped.some((c) => frames(c) === 1),
      "one frame",
    ).toBe(true);
    expect(
      grouped.some((c) => frames(c) === 0),
      "no frame under a Group-by mode",
    ).toBe(true);
    expect(
      canvases.some(
        (c) => routes(c) && [...c.res.nodes.values()].every((n) => categoryOf(n) === null),
      ),
      "no infra or external",
    ).toBe(true);
  });
});
