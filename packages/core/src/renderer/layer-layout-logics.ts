/**
 * Shared layer-layout logic used by both layout.ts and deploy-layout.ts.
 *
 * Extracted from deploy-layout.ts where it was originally implemented as
 * sortLayerByBarycenter. Both the architecture diagram and the deploy diagram
 * use the same Sugiyama-style barycenter heuristic to minimize edge crossings
 * within each layer.
 */

import type { ResolvedLayoutHints } from "../types/style.js";

/**
 * Sort items within a layer by the barycenter heuristic to minimize edge crossings.
 *
 * For each item, the barycenter is the average X-center of its predecessors
 * in the previous layer (items that already have a recorded center X position).
 * Items with no predecessors in the previous layer get Infinity and are placed last,
 * preserving their relative insertion order (stable sort).
 */
export function sortByBarycenter<T extends { id: string }>(
  items: T[],
  predecessorsMap: Map<string, string[]>,
  centerX: Map<string, number>,
): T[] {
  const barycenter = new Map<string, number>();
  for (const item of items) {
    const preds = (predecessorsMap.get(item.id) ?? []).filter((p) => centerX.has(p));
    if (preds.length === 0) {
      barycenter.set(item.id, Infinity);
    } else {
      const avg = preds.reduce((sum, p) => sum + centerX.get(p)!, 0) / preds.length;
      barycenter.set(item.id, avg);
    }
  }
  return [...items].sort((a, b) => barycenter.get(a.id)! - barycenter.get(b.id)!);
}

/**
 * Bucket items by their resolved `column` hint (`left` / unspecified-or-center / `right`),
 * preserving the relative input order within each bucket. Used to honor the
 * `.krs.style` `column` property in system view (see `docs/design/auto-layout-style-hints.md`).
 *
 * The middle bucket merges unspecified nodes and `column: center` nodes so
 * authors can pin only the extremes (`left` / `right`) and let the rest
 * settle in the middle without writing `center` explicitly.
 *
 * Returns the input array unchanged when no item has a `left` or `right`
 * hint, so call sites can safely route every layer through this helper
 * without measuring whether bucketing actually applies.
 */
export function bucketByColumn<T extends { id: string }>(
  items: T[],
  layoutHints: Map<string, ResolvedLayoutHints>,
): T[] {
  const left: T[] = [];
  const middle: T[] = [];
  const right: T[] = [];
  for (const item of items) {
    const col = layoutHints.get(item.id)?.column;
    if (col === "left") left.push(item);
    else if (col === "right") right.push(item);
    else middle.push(item);
  }
  if (left.length === 0 && right.length === 0) return items;
  return [...left, ...middle, ...right];
}
