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

  it("equals the stable sort-then-slice when the comparator has ties", () => {
    // Keys from a range of 4, so most values tie; the ids tell equals apart.
    // Sort is stable, so this pins that ties keep their input order here too.
    const rand = lcg(12345);
    const byKey = (a: { key: number }, b: { key: number }) => a.key - b.key;
    for (let trial = 0; trial < 500; trial++) {
      const n = Math.floor(rand() * 40);
      const values = Array.from({ length: n }, (_, id) => ({ key: Math.floor(rand() * 4), id }));
      for (const k of [1, 3, 8, n, n + 2]) {
        expect(firstInOrder(values, k, byKey).map((v) => v.id)).toEqual(
          sortThenSlice(values, k, byKey).map((v) => v.id),
        );
      }
    }
  });

  it("picks the expected values, and keeps input order among ties", () => {
    const asc = (a: number, b: number) => a - b;
    expect(firstInOrder([6, 4, 9, 1, 7], 2, asc)).toEqual([1, 4]);
    // 4 and 6 are equally far from 5: the first in the input wins, as sort's
    // stability would have it.
    const nearFive = (a: number, b: number) => Math.abs(a - 5) - Math.abs(b - 5);
    expect(firstInOrder([6, 4], 1, nearFive)).toEqual([6]);
    expect(firstInOrder([4, 6], 1, nearFive)).toEqual([4]);
    // With the corridor comparator's final `a - b`, the smaller x wins either way.
    const nearFiveThenX = (a: number, b: number) => nearFive(a, b) || a - b;
    expect(firstInOrder([6, 4], 1, nearFiveThenX)).toEqual([4]);
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
