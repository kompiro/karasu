import { describe, expect, it } from "vitest";
import { firstInOrder } from "./first-in-order.js";

/** Deterministic pseudo-random sequence, so a failure reproduces. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const sortThenSlice = <T>(values: readonly T[], k: number, cmp: (a: T, b: T) => number): T[] =>
  values.slice().sort(cmp).slice(0, k);

describe("firstInOrder", () => {
  it("equals sort-then-slice under a strict total order", () => {
    const rand = lcg(2944);
    const asc = (a: number, b: number) => a - b;
    for (let trial = 0; trial < 200; trial++) {
      const n = Math.floor(rand() * 60);
      const values = [...new Set(Array.from({ length: n }, () => Math.round(rand() * 1000)))];
      for (const k of [1, 2, 8, n, n + 3]) {
        expect(firstInOrder(values, k, asc)).toEqual(sortThenSlice(values, k, asc));
      }
    }
  });

  it("equals sort-then-slice for the corridor comparator, whose first key ties", () => {
    // The shape `routeGroupedEdges` uses: distance from a midpoint (candidates
    // either side of it tie), then distance from the target's centre, then `x`.
    // Only the final `a - b` makes the order strict; without it this test is the
    // one that would notice.
    const rand = lcg(7);
    for (let trial = 0; trial < 200; trial++) {
      const mid = Math.round(rand() * 800);
      const toCentre = Math.round(rand() * 800);
      const xs = new Set<number>();
      for (let i = 0; i < 40; i++) {
        const d = Math.round(rand() * 200);
        xs.add(mid - d);
        xs.add(mid + d);
      }
      const values = [...xs];
      const cmp = (a: number, b: number) =>
        Math.abs(a - mid) - Math.abs(b - mid) ||
        Math.abs(a - toCentre) - Math.abs(b - toCentre) ||
        a - b;
      expect(firstInOrder(values, 8, cmp)).toEqual(sortThenSlice(values, 8, cmp));
    }
  });

  it("returns everything, ordered, when k is at least the length", () => {
    expect(firstInOrder([5, 1, 4], 8, (a, b) => a - b)).toEqual([1, 4, 5]);
  });

  it("returns an empty list for no values or a non-positive k", () => {
    const asc = (a: number, b: number) => a - b;
    expect(firstInOrder([], 8, asc)).toEqual([]);
    expect(firstInOrder([3, 1, 2], 0, asc)).toEqual([]);
  });

  it("does not modify its input", () => {
    const values = [3, 1, 2];
    firstInOrder(values, 2, (a, b) => a - b);
    expect(values).toEqual([3, 1, 2]);
  });
});
