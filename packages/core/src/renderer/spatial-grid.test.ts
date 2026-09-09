import { describe, it, expect } from "vitest";
import { BoxGrid, chooseCellSize } from "./spatial-grid.js";

/** Small seeded PRNG (mulberry32) so a failing case is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Closed-interval AABB overlap — touching counts. The exact predicate the grid must never under-report. */
function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Random box whose coordinates deliberately land on the interesting places: a
 * lattice of multiples of `cell` (cell boundaries and exact touches), plain
 * floats, zero-size boxes (a point or an axis-parallel segment), and the
 * occasional box far outside the extent the grid was sized for.
 */
function randomBox(rnd: () => number, cell: number, span: number): Box {
  const coord = (): number => {
    const r = rnd();
    if (r < 0.4) return Math.floor(rnd() * (span / cell + 1)) * cell; // on a cell boundary
    if (r < 0.45) return span * (rnd() < 0.5 ? -3 : 4) + rnd() * span; // outside the extent
    return rnd() * span;
  };
  const x0 = coord();
  const y0 = coord();
  const kind = rnd();
  let x1: number;
  let y1: number;
  if (kind < 0.15) {
    x1 = x0;
    y1 = y0; // a point
  } else if (kind < 0.3) {
    x1 = coord();
    y1 = y0; // horizontal, zero height
  } else if (kind < 0.45) {
    x1 = x0;
    y1 = coord(); // vertical, zero width
  } else {
    x1 = coord();
    y1 = coord();
  }
  return {
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  };
}

describe("chooseCellSize (#2760)", () => {
  it("falls back to the floor for degenerate input", () => {
    expect(chooseCellSize([], 1000, 1000)).toBe(16);
    expect(chooseCellSize([0, 0, 0], 1000, 1000)).toBe(16);
    expect(chooseCellSize([5, 3], 0, 0)).toBe(16);
  });

  it("ignores an estimate that is not finite and keeps the other", () => {
    expect(chooseCellSize([50], Number.POSITIVE_INFINITY, 10)).toBe(50);
    expect(chooseCellSize([Number.NaN], 100, 100)).toBe(100);
  });

  it("takes the smaller of the median size and the density size", () => {
    // Median 40 on a 100 × 100 extent with 4 boxes: density √(10000 / 4) = 50 → 40.
    expect(chooseCellSize([10, 40, 40, 900], 100, 100)).toBe(40);
    // Median 1000 (edges spanning the canvas) but 100 of them on 1000 × 1000: density 100.
    expect(chooseCellSize(new Array(100).fill(1000), 1000, 1000)).toBe(100);
  });

  it("raises the cell so a huge extent needs at most 512 cells per axis", () => {
    expect(chooseCellSize([20, 20, 20], 1_000_000, 100)).toBe(1_000_000 / 512);
  });
});

describe("BoxGrid (#2760)", () => {
  it("reports every touching box (superset of the exact closed-interval test), each once", () => {
    const CASES = 400;
    for (let seed = 1; seed <= CASES; seed++) {
      const rnd = mulberry32(seed);
      const cell = [16, 25, 40, 100][Math.floor(rnd() * 4)];
      const span = cell * (2 + Math.floor(rnd() * 12));
      const n = 1 + Math.floor(rnd() * 40);
      const boxes = Array.from({ length: n }, () => randomBox(rnd, cell, span));
      // Size the grid from the first half only, so the rest exercise the
      // clamp-to-border path (boxes inserted outside the measured extent).
      const measured = boxes.slice(0, Math.max(1, n >> 1));
      const grid = new BoxGrid(
        cell,
        Math.min(...measured.map((b) => b.minX)),
        Math.min(...measured.map((b) => b.minY)),
        Math.max(...measured.map((b) => b.maxX)),
        Math.max(...measured.map((b) => b.maxY)),
      );
      boxes.forEach((b, id) => grid.insert(id, b.minX, b.minY, b.maxX, b.maxY));

      const out: number[] = [];
      for (let q = 0; q < 8; q++) {
        const query = q < n ? boxes[q] : randomBox(rnd, cell, span);
        const got = [...grid.query(query.minX, query.minY, query.maxX, query.maxY, out)];
        expect(new Set(got).size, `seed ${seed}: duplicate ids`).toBe(got.length);
        const gotSet = new Set(got);
        const missed = boxes
          .map((b, id) => (boxesTouch(query, b) && !gotSet.has(id) ? id : -1))
          .filter((id) => id >= 0);
        expect(missed, `seed ${seed}: boxes touching the query but not reported`).toEqual([]);
      }
    }
  });

  it("survives a single box, a zero-extent grid and huge coordinates", () => {
    const out: number[] = [];
    const single = new BoxGrid(16, 5, 5, 5, 5);
    single.insert(0, 5, 5, 5, 5);
    expect(single.query(5, 5, 5, 5, out)).toEqual([0]);
    expect(single.query(-1e9, -1e9, 1e9, 1e9, out)).toEqual([0]);
    // A zero-extent grid is one cell: every query is answered with its box (a
    // superset is the contract; the caller's exact test decides).
    expect(single.query(6, 6, 7, 7, out)).toEqual([0]);

    const huge = new BoxGrid(chooseCellSize([1e6], 1e12, 1e12), -1e12, -1e12, 1e12, 1e12);
    huge.insert(0, -1e12, -1e12, 1e12, 1e12);
    huge.insert(1, 3e11, 3e11, 3e11 + 1e6, 3e11 + 1e6);
    expect(huge.query(3e11, 3e11, 3e11, 3e11, out).sort()).toEqual([0, 1]);
    expect(huge.query(-5e11, -5e11, -5e11, -5e11, out)).toEqual([0]);
  });
});
