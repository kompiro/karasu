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
import { relaxedColumnCap } from "./aspect-search.js";

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
function bucketByColumn<T extends { id: string }>(
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
 * (ADR-1061). The final position therefore reflects the most
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

/** A node's placement inside its container's local coordinate space. */
export interface PlacedNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Input for the layered placement both layout pipelines share (#2514).
 *
 * Per layer, in order: barycenter sort (only where the kind-tier layout is not
 * forcing declaration order, per Q11 of the layout design doc), the author's
 * column buckets, per-edge direction hints, then a wrap into rows bounded by
 * the balanced-grid column count and the row-width budget. Rows stack downward
 * inside the layer; layers stack by `LAYER_GAP` below the previous layer's
 * bottom, with `GROUP_FRAME_TITLE_GAP` reserved above a band's first layer.
 *
 * The two pipelines used to carry separate copies of this: the multi-system
 * one wrapped one `NODE_GAP` earlier (it compared a running x that already
 * included the leading gap) and computed each layer's y by rescanning every
 * placed node, while only it ran the barycenter pass. The scan and the running
 * baseline agree by construction (rows only ever move downward), so what
 * converges here is the wrap threshold and the crossing-minimisation pass
 * (TPL-219).
 */
interface PlaceNodesInput {
  /** Layer indices in ascending order. */
  sortedLayers: readonly number[];
  /** Node ids per layer, in declaration order. */
  nodesByLayer: ReadonlyMap<number, string[]>;
  /** Intra-canvas edges, for the direction hints and the barycenter predecessors. */
  edges: readonly KrsEdge[];
  edgeDirections: Map<string, EdgeDirection> | undefined;
  /** Resolved layer index per node, for `applyEdgeDirectionWithinLayer`. */
  layers: Map<string, number>;
  /** Non-null when the kind tiers (or group bands) fixed the layering. */
  forcedLayers: Map<string, number> | null;
  layoutHints: Map<string, ResolvedLayoutHints> | undefined;
  /** The container's own `grid-columns` hint, when it declared one. */
  gridHint: number | undefined;
  /** Layers that start a group band, which reserve room for the frame title. */
  groupStartLayer: ReadonlyMap<number, string>;
  gaps: { layerGap: number; nodeGap: number; maxLayerWidth: number; groupTitleGap: number };
  /**
   * Row-width budget picked by the canvas-level aspect search (#2593).
   * Defaults to `gaps.maxLayerWidth`, which is also its floor: the ratio
   * between the two is what relaxes the balanced-grid column cap.
   */
  widthBudget?: number;
  measure: (nodeId: string) => { width: number; height: number };
}

/**
 * Place layered nodes into wrapped, stacked rows.
 *
 * Pure: the only state it touches is built inside, so the canvas-level aspect
 * search in `layout()` can call it once per candidate row-width budget and
 * throw away the runs that lose (#2593). Measurement stays with the caller: it
 * owns the owner chips and the measure context that decide a card's size.
 */
export function placeNodesInLayers(input: PlaceNodesInput): {
  placements: Map<string, PlacedNode>;
  childMaxWidth: number;
  childMaxHeight: number;
} {
  const widthBudget = input.widthBudget ?? input.gaps.maxLayerWidth;
  const { sortedLayers, nodesByLayer, edges, edgeDirections, layers } = input;
  const { forcedLayers, layoutHints, gridHint, groupStartLayer, gaps, measure } = input;
  const { layerGap, nodeGap, maxLayerWidth, groupTitleGap } = gaps;

  // Predecessors within this canvas, for the barycenter pass.
  const idSet = new Set<string>();
  for (const ids of nodesByLayer.values()) for (const id of ids) idSet.add(id);
  const predecessorsMap = new Map<string, string[]>();
  for (const id of idSet) predecessorsMap.set(id, []);
  for (const edge of edges) {
    if (idSet.has(edge.from) && idSet.has(edge.to)) predecessorsMap.get(edge.to)!.push(edge.from);
  }

  const placements = new Map<string, PlacedNode>();
  const nodeCenterX = new Map<string, number>();
  let childMaxWidth = 0;
  let childMaxHeight = 0;
  let layerBaselineY = nodeGap;

  for (let layerOrder = 0; layerOrder < sortedLayers.length; layerOrder++) {
    const layerIdx = sortedLayers[layerOrder];
    if (groupStartLayer.has(layerIdx)) layerBaselineY += groupTitleGap;

    const rawLayer = nodesByLayer.get(layerIdx)!.map((id) => ({ id }));
    // Barycenter minimises crossings, but only where declaration order is not
    // load-bearing: the forced kind-tier layout owns its within-layer order.
    const sorted =
      forcedLayers !== null || layerOrder === 0
        ? rawLayer
        : sortByBarycenter(rawLayer, predecessorsMap, nodeCenterX);
    const bucketed =
      forcedLayers !== null && layoutHints && layoutHints.size > 0
        ? bucketByColumn(sorted, layoutHints)
        : sorted;
    const nodesInLayer = applyEdgeDirectionWithinLayer(
      bucketed.map((item) => item.id),
      edges as KrsEdge[],
      edgeDirections,
      layers,
    );

    const dimsById = new Map<string, { width: number; height: number }>();
    for (const nid of nodesInLayer) dimsById.set(nid, measure(nid));
    const rows = wrapLayerIntoRows(
      nodesInLayer,
      (nid) => dimsById.get(nid)!.width,
      gridColumnCount(
        nodesInLayer.length,
        gridHint,
        relaxedColumnCap(GRID_COLUMN_CAP, widthBudget, maxLayerWidth),
      ),
      widthBudget,
      nodeGap,
    );

    let rowY = layerBaselineY;
    let layerBottom = layerBaselineY;
    for (const row of rows) {
      let xOffset = nodeGap;
      let rowMaxHeight = 0;
      for (const nid of row) {
        const dims = dimsById.get(nid)!;
        placements.set(nid, { x: xOffset, y: rowY, width: dims.width, height: dims.height });
        nodeCenterX.set(nid, xOffset + dims.width / 2);
        xOffset += dims.width + nodeGap;
        childMaxWidth = Math.max(childMaxWidth, xOffset);
        rowMaxHeight = Math.max(rowMaxHeight, dims.height);
      }
      layerBottom = rowY + rowMaxHeight;
      childMaxHeight = Math.max(childMaxHeight, layerBottom + nodeGap);
      rowY = layerBottom + nodeGap; // sub-row gap within the layer
    }
    layerBaselineY = layerBottom + layerGap;
  }

  return { placements, childMaxWidth, childMaxHeight };
}
