import { describe, it, expect } from "vitest";
import {
  candidateWidthBudgets,
  MAX_CANVAS_ASPECT,
  MIN_CANVAS_ASPECT,
  searchWidthBudget,
  squareness,
  withinAspectBand,
} from "./aspect-search.js";

describe("candidateWidthBudgets", () => {
  it("starts at the floor and ascends", () => {
    const budgets = candidateWidthBudgets(1200);
    expect(budgets[0]).toBe(1200);
    for (let i = 1; i < budgets.length; i++) expect(budgets[i]).toBeGreaterThan(budgets[i - 1]);
  });

  it("is deterministic and integral", () => {
    const a = candidateWidthBudgets(1200);
    const b = candidateWidthBudgets(1200);
    expect(a).toEqual(b);
    for (const v of a) expect(Number.isInteger(v)).toBe(true);
  });

  it("stops at the configured multiple of the floor", () => {
    const budgets = candidateWidthBudgets(1000, 6);
    expect(budgets[budgets.length - 1]).toBe(6000);
  });
});

describe("squareness", () => {
  it("is zero at square and symmetric in log space", () => {
    expect(squareness(500, 500)).toBe(0);
    expect(squareness(1000, 500)).toBeCloseTo(squareness(500, 1000), 12);
  });

  it("rejects a degenerate canvas", () => {
    expect(squareness(0, 500)).toBe(Infinity);
    expect(squareness(500, 0)).toBe(Infinity);
  });
});

describe("withinAspectBand", () => {
  it("accepts everything between portrait and landscape 16:9", () => {
    expect(withinAspectBand(1600, 900)).toBe(true);
    expect(withinAspectBand(900, 1600)).toBe(true);
    expect(withinAspectBand(1000, 1000)).toBe(true);
  });

  it("rejects a ribbon on either axis", () => {
    expect(withinAspectBand(4000, 500)).toBe(false);
    expect(withinAspectBand(500, 4000)).toBe(false);
  });

  it("is symmetric", () => {
    expect(MAX_CANVAS_ASPECT * MIN_CANVAS_ASPECT).toBeCloseTo(1, 12);
  });
});

describe("searchWidthBudget", () => {
  // A canvas of `area` that packs into rows of `budget`: width grows with the
  // budget, height falls with it — the monotone relationship the real
  // placement has.
  const canvas = (area: number) => (budget: number) => ({
    width: budget,
    height: Math.ceil(area / budget),
  });

  it("keeps the floor when widening only trades one axis for the other", () => {
    // Area is exactly conserved, and the floor is inside the band but NOT
    // square (1200x1440, aspect 0.83) — so a later candidate is squarer and
    // ties on area. That is precisely the case the floor-first rule is about:
    // rearranging the same canvas must not take the floor's placement away.
    // With a square floor the assertion would hold for the wrong reason.
    const inBand = (budget: number) => ({ width: budget, height: 1_728_000 / budget });
    expect(withinAspectBand(1200, 1_728_000 / 1200)).toBe(true);
    expect(squareness(1412, 1_728_000 / 1412)).toBeLessThan(squareness(1200, 1_728_000 / 1200));

    const found = searchWidthBudget(inBand, (r) => r, { floor: 1200 });

    expect(found.budget).toBe(1200);
  });

  it("defends the floor against a wider candidate whose canvas is larger", () => {
    // Ragged rows make a wider budget waste area even though it stays in the
    // band — the floor has to win on area, not on being first.
    const wasteful = (budget: number) => ({
      width: budget,
      height: budget === 1200 ? 1000 : 1000 + (budget - 1200),
    });
    const found = searchWidthBudget(wasteful, (r) => r, { floor: 1200 });

    expect(found.budget).toBe(1200);
    expect(found.result.width * found.result.height).toBe(1200 * 1000);
  });

  it("pulls a canvas outside the band back inside it", () => {
    const tall = searchWidthBudget(canvas(9_000_000), (r) => r, { floor: 1200 });
    expect(tall.budget).toBeGreaterThan(1200);
    expect(withinAspectBand(tall.result.width, tall.result.height)).toBe(true);
  });

  it("prefers the smaller canvas among candidates inside the band", () => {
    // Shelf packing: a row that fits 3 cards of 400 wastes nothing, 2 cards
    // waste a third of every row. Only the budgets are enumerated, so the
    // wasteful ones must lose on area.
    const shelf = (budget: number) => {
      const perRow = Math.max(1, Math.floor(budget / 400));
      const rows = Math.ceil(9 / perRow);
      return { width: perRow * 400, height: rows * 400 };
    };
    const found = searchWidthBudget(shelf, (r) => r, { floor: 1200 });
    expect(found.result.width * found.result.height).toBe(1200 * 1200);
  });

  it("is deterministic", () => {
    const once = searchWidthBudget(canvas(9_000_000), (r) => r, { floor: 1200 });
    const twice = searchWidthBudget(canvas(9_000_000), (r) => r, { floor: 1200 });
    expect(twice.budget).toBe(once.budget);
  });

  it("keeps evaluating past a candidate that leaves the band", () => {
    // An earlier revision stopped here, on the grounds that the canvas is
    // monotone in the budget. It is not — a row's height is its tallest card,
    // so re-wrapping can raise the total — and a search that stops early on a
    // false invariant can miss the smallest canvas. Only `exhausted` ends it.
    const calls: number[] = [];
    searchWidthBudget(
      (budget) => {
        calls.push(budget);
        // Out of band immediately, then back in band and much smaller: a
        // stop-at-the-band search would never see the winner.
        return budget === 1200
          ? { width: 4000, height: 500 }
          : budget === 1412
            ? { width: 4200, height: 480 }
            : { width: 900, height: 800 };
      },
      (r) => r,
      { floor: 1200 },
    );

    expect(calls).toEqual(candidateWidthBudgets(1200));
  });

  it("returns the smallest in-band canvas, matching an exhaustive scan", () => {
    // The search's contract, stated against a brute-force oracle rather than
    // against the shortcuts it takes to get there.
    const shapes = (budget: number) => {
      const perRow = Math.max(1, Math.floor(budget / 370));
      const rows = Math.ceil(23 / perRow);
      return { width: perRow * 370, height: rows * 210 };
    };
    const budgets = candidateWidthBudgets(1200);
    const oracle = budgets
      .map(shapes)
      .filter((c) => withinAspectBand(c.width, c.height))
      .reduce((best, c) => (c.width * c.height < best.width * best.height ? c : best));

    const found = searchWidthBudget(shapes, (r) => r, { floor: 1200 });

    expect(found.result.width * found.result.height).toBe(oracle.width * oracle.height);
  });

  it("falls back to the least-bad canvas when none fits the band", () => {
    // A single very wide row: every budget leaves the canvas outside the band.
    const ribbon = (budget: number) => ({ width: Math.max(budget, 8000), height: 300 });
    const found = searchWidthBudget(ribbon, (r) => r, { floor: 1200 });
    expect(withinAspectBand(found.result.width, found.result.height)).toBe(false);
    expect(found.budget).toBe(1200);
  });
});

describe("searchWidthBudget > degenerate canvas", () => {
  it("returns the first run when every candidate measures 0 x 0", () => {
    // An empty view: nothing to place, so no candidate is inside the band and
    // none is more square than another. The caller still needs a result.
    const found = searchWidthBudget(
      () => ({ width: 0, height: 0, tag: "empty" }),
      (r) => r,
      { floor: 1200 },
    );
    expect(found.result.tag).toBe("empty");
    expect(found.budget).toBe(1200);
  });
});
