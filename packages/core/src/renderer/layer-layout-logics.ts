/**
 * Shared layer-layout logic used by both layout.ts and deploy-layout.ts.
 *
 * Extracted from deploy-layout.ts where it was originally implemented as
 * sortLayerByBarycenter. Both the architecture diagram and the deploy diagram
 * use the same Sugiyama-style barycenter heuristic to minimize edge crossings
 * within each layer.
 */

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
