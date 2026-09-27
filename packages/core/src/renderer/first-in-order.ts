/**
 * The first `k` of `values` in `cmp` order: `values.slice().sort(cmp).slice(0, k)`
 * without sorting the rest (#2944).
 *
 * The corridor router asks for 8 candidates out of a few hundred, once per
 * routed edge; a full sort there cost O(N log N) per edge to use 8 values.
 * This keeps a bounded, ordered list and inserts into it, O(N·k).
 *
 * The result equals sort-then-slice only when `cmp` is a **strict total
 * order** over `values`, i.e. no two distinct values compare equal. Under ties
 * the relative order of equals is not specified here, whereas
 * `Array.prototype.sort` is stable. Callers keep the equality by ending the
 * comparator in a final tiebreak over de-duplicated values.
 */
export function firstInOrder<T>(values: readonly T[], k: number, cmp: (a: T, b: T) => number): T[] {
  const best: T[] = [];
  if (k <= 0) return best;
  for (const v of values) {
    if (best.length === k && cmp(v, best[k - 1]) >= 0) continue;
    // Full: `v` displaces the current last; otherwise it takes a new slot.
    let i = best.length === k ? k - 1 : best.length;
    if (best.length < k) best.push(v);
    while (i > 0 && cmp(v, best[i - 1]) < 0) {
      best[i] = best[i - 1];
      i--;
    }
    best[i] = v;
  }
  return best;
}
