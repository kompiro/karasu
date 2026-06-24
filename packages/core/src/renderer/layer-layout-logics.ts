/**
 * Shared layer-layout logic used by both layout.ts and deploy-layout.ts.
 *
 * Extracted from deploy-layout.ts where it was originally implemented as
 * sortLayerByBarycenter. Both the architecture diagram and the deploy diagram
 * use the same Sugiyama-style barycenter heuristic to minimize edge crossings
 * within each layer.
 */

import type { EdgeDirection, ResolvedLayoutHints } from "../types/style.js";
import type { KrsEdge } from "../types/ast.js";

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
 * Default upper bound on the auto-balanced grid column count. Derived from
 * the "7±2" span-of-control heuristic: keep a single view graspable at a
 * glance instead of letting many siblings sprawl into one wide row that
 * forces a zoom-out (`docs/concepts.md` scoped-glance, resolution axis).
 */
export const GRID_COLUMN_CAP = 5;

/**
 * Resolve how many columns a layer of `n` sibling nodes should wrap into.
 *
 * When the author pins `grid-columns: N` (a positive integer hint) on the
 * container, that value wins outright — even above the cap, since it is a
 * deliberate choice. Otherwise:
 * - a small set (`n <= cap`) stays on a single row (`n` columns) — a handful
 *   of siblings reads fine across, and wrapping it would only add churn;
 * - a larger set auto-balances toward a square (`ceil(sqrt(n))`) capped at
 *   {@link GRID_COLUMN_CAP} so it grows downward rather than sideways.
 *
 * Examples (cap 5): 3 → 3 (one row), 9 → 3 (3×3), 10 → 4 (4×3), 25 → 5 (5×5).
 *
 * Always returns at least 1. Deterministic — no width or pixel input.
 */
export function gridColumnCount(n: number, hint?: number, cap: number = GRID_COLUMN_CAP): number {
  if (hint !== undefined && Number.isInteger(hint) && hint > 0) return hint;
  if (n <= 1) return 1;
  if (n <= cap) return n;
  return Math.min(Math.ceil(Math.sqrt(n)), cap);
}

/**
 * Wrap an ordered list of sibling items into grid rows, breaking to a new row
 * whenever **either** the per-row column count is reached **or** the
 * accumulated row width would exceed `maxWidth` (whichever comes first). The
 * width bound keeps a forced large `grid-columns` from overflowing the frame.
 *
 * Pure and deterministic: declaration order is preserved (row-major), and the
 * result depends only on the measured widths, `columnCount`, `maxWidth`, and
 * `gap`. Callers position the returned rows (baseline Y, centering) themselves,
 * so this helper is shared across the single-system, multi-system, deploy, and
 * org member-grid paths without each re-implementing the wrap rule.
 */
export function wrapLayerIntoRows<T>(
  items: readonly T[],
  widthOf: (item: T) => number,
  columnCount: number,
  maxWidth: number,
  gap: number,
): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
  let currentWidth = 0;
  for (const item of items) {
    const w = widthOf(item);
    const wouldOverflowWidth = current.length > 0 && currentWidth + gap + w > maxWidth;
    const reachedColumnCap = current.length >= columnCount;
    if (current.length > 0 && (reachedColumnCap || wouldOverflowWidth)) {
      rows.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(item);
    currentWidth += current.length === 1 ? w : gap + w;
  }
  if (current.length > 0) rows.push(current);
  return rows;
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

/**
 * Apply per-edge `direction: left` / `direction: right` hints as a final
 * within-layer reordering pass. Runs after `bucketByColumn` and overrides
 * its placement for the involved source endpoint (per-edge hint > node
 * `column` hint, see docs/design/edge-direction-horizontal.md).
 *
 * For each hinted edge whose `from` and `to` end up in the same layer,
 * the source is moved adjacent to the target — directly to the right
 * (`direction: right`) or directly to the left (`direction: left`).
 * Cross-layer hints are silent no-ops; the layered layout has no clean
 * projection for "horizontal" when source and target sit in different
 * rows.
 *
 * Conflicts on the same source are resolved by **declaration order with
 * last-wins**, matching the project-wide cascade convention
 * (ADR-20260430-04). The final position therefore reflects the most
 * recently appended `.krs.style` rule, which lines up with the GUI
 * editor's append flow (#1076).
 *
 * Returns the input array unchanged when no hint applies, so call sites
 * can route every layer through this helper without measuring whether
 * any edge in scope carries a horizontal direction.
 */
export function applyEdgeDirectionWithinLayer(
  ordered: string[],
  edges: readonly KrsEdge[],
  edgeDirections: Map<string, EdgeDirection> | undefined,
  layerOf: Map<string, number>,
): string[] {
  if (!edgeDirections || edgeDirections.size === 0) return ordered;

  const inLayer = new Set(ordered);
  // Pre-flight: are any edges in scope?
  const applicable: Array<{ from: string; to: string; direction: "left" | "right" }> = [];
  for (const edge of edges) {
    if (!inLayer.has(edge.from) || !inLayer.has(edge.to)) continue;
    if (layerOf.get(edge.from) !== layerOf.get(edge.to)) continue;
    const dir = edgeDirections.get(`${edge.from}->${edge.to}`);
    if (dir === "left" || dir === "right") {
      applicable.push({ from: edge.from, to: edge.to, direction: dir });
    }
  }
  if (applicable.length === 0) return ordered;

  let result = [...ordered];
  for (const hint of applicable) {
    const fromIdx = result.indexOf(hint.from);
    const toIdx = result.indexOf(hint.to);
    if (fromIdx < 0 || toIdx < 0) continue;
    // Remove source first so toIdx stays meaningful for the destination.
    result.splice(fromIdx, 1);
    const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    // `direction: right` means the visual arrow flows rightward (mirrors
    // `up` / `down` where the value names the arrow flow direction). The
    // source therefore lands to the *left* of the target. `direction: left`
    // mirrors with the source on the *right*.
    const insertAt = hint.direction === "right" ? adjustedToIdx : adjustedToIdx + 1;
    result.splice(insertAt, 0, hint.from);
  }
  return result;
}
