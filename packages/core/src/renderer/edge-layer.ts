import type { ResolvedStyles } from "../types/style.js";
import { edgeStyleKey } from "../resolver/style-resolver.js";
import { edgeKey } from "../diff/view-diff.js";
import type { HopMark, LayoutResult } from "./layout-types.js";
import { renderEdge } from "./edge-routing.js";
import { resolveLabelPlacements, buildLabelInputs } from "./label-placement.js";
import {
  edgesWithMarks,
  renderCrossingMarks,
  renderTrunkBands,
  type MarkState,
} from "./crossing-marks-svg.js";
import { frameBordersOf } from "./container-frame.js";
import { el } from "./svg-builder.js";
import { GHOST_OPACITY } from "./rendering-constants.js";
import type { DiagramPalette } from "./palette.js";
import { FACET_DIM_OPACITY, type FacetOverlay } from "./facet-overlay.js";

/**
 * The edge pass of `renderFromLayout`: ghost edges, trunk bands, edges and
 * crossing marks, in paint order. Returns the parts to append after the
 * container frames. `facetsFor` is the renderer's card facet lookup, shared
 * with the node pass so an edge endpoint reads the same rings its card draws.
 */
export function renderEdgeLayer(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  palette: DiagramPalette,
  colorToMarkerId: ReadonlyMap<string, string>,
  facetsFor: (nodeId: string, layoutId: string, path?: readonly string[]) => readonly string[],
  overlay: FacetOverlay | undefined,
  edgeDiffState: Map<string, string> | undefined,
): string[] {
  const parts: string[] = [];
  // Ghost edges — ghost wrapper dims children to GHOST_OPACITY so they read
  // as peripheral. When diff mode is active and a ghost edge has a non-
  // "unchanged" state, move it to the normal-edges group so the diff colors
  // are not washed out by the wrapper opacity.
  const ghostEdgeParts: string[] = [];
  const normalEdgeParts: string[] = [];
  /**
   * An edge's own selected facets (#2544), read off the layout edge rather than
   * out of a membership map: an edge's `canonicalId` is `undefined` whenever its
   * base form collided (ADR-1096), so there is no id to key it by. Filtered
   * through the overlay's own order — never the edge's declaration order — so
   * the innermost casing is the same facet on every edge, the rule the node
   * rings follow.
   */
  const facetOrder = overlay?.entries.map((e) => e.id) ?? [];
  const edgeFacetsFor = (edgeLayout: LayoutResult["edges"][number]): readonly string[] => {
    const own = edgeLayout.facets;
    if (!overlay || own === undefined) return [];
    return facetOrder.filter((id) => own.includes(id));
  };

  // A collapsed team's re-targeted stub edges are keyed by the stub id, which
  // the original `edgeDiffState` (keyed on pre-collapse endpoints) cannot match;
  // `layout` folds their diff state onto the stub key, so overlay it here so the
  // stub edge keeps its `data-diff-state` (#1886). Stub keys use the reserved
  // `__group_collapsed_*__` prefix, so they never collide with real edge keys.
  const effectiveEdgeDiffState = layoutResult.foldedEdgeDiffState
    ? new Map<string, string>([
        ...(edgeDiffState ?? new Map<string, string>()),
        ...layoutResult.foldedEdgeDiffState,
      ])
    : edgeDiffState;
  // Resolved stroke of each edge, indexed to match `layoutResult.edges` — so a
  // crossing mark can be drawn in its own edge's colour/width (#1859 P2c-C),
  // not a fixed default that detaches from a coloured diagram.
  // Hops grouped by their host edge index (== position in `layoutResult.edges`,
  // the same array `computeCrossingMarks` indexed), so the host edge's stroke can
  // be gapped where each hop jumps over a crossing (#1859 P2c-C).
  const hopsByEdge = new Map<number, HopMark[]>();
  for (const hop of layoutResult.crossingMarks?.hops ?? []) {
    const list = hopsByEdge.get(hop.edge);
    if (list) list.push(hop);
    else hopsByEdge.set(hop.edge, [hop]);
  }
  // Resolve the edge style once per edge (reused by both the label-placement
  // pre-pass and the render loop below).
  const edgeStyleFor = (edgeLayout: LayoutResult["edges"][number]) => {
    // Prefer the kind-qualified style entry so parallel sync/async edges between
    // the same pair keep their own stroke style; fall back to the bare key for
    // synthetic layout edges (delivers, owns, ghosts, aggregated domain edges).
    return (
      styles.edges.get(edgeStyleKey(edgeLayout.from, edgeLayout.to, edgeLayout.kind)) ??
      styles.edges.get(edgeStyleKey(edgeLayout.from, edgeLayout.to, undefined)) ??
      styles.defaultEdgeStyle
    );
  };

  // Auto label collision-avoidance (#2048): nudge labels that collide with node
  // cards, with each other, or with another edge's polyline (#2360) off their
  // default midpoint. A label's own edge line is exempt — that is where it
  // belongs. Author-positioned labels (non-default label-position/label-offset)
  // are excluded from moving but still act as obstacles, so author intent wins
  // (ADR-1184 precedence). A nudge never carries a label onto or across the
  // border of a frame drawn above (#3155), measured on the stroke drawn there.
  const {
    inputs: labelInputs,
    nodeRects,
    edgeLines,
  } = buildLabelInputs(layoutResult.edges, layoutResult.nodes, edgeStyleFor);
  const frameBorders = frameBordersOf(layoutResult, styles, palette);
  const labelPlacements = resolveLabelPlacements(labelInputs, nodeRects, edgeLines, frameBorders);
  // Labels the pass could not seat clear under `label-display: auto` (#3022).
  // The pass reports them on its inputs; `renderEdge` leaves them off the canvas.
  const deferredLabels = new Set(labelInputs.filter((l) => l.deferred).map((l) => l.index));

  const edgeStroke: { color: string; strokeWidth: number }[] = [];
  const markedEdges = edgesWithMarks(layoutResult.crossingMarks);
  // What the crossing marks follow from their edges (#3157), by edge index.
  const markState: MarkState = { dimmed: new Set(), diffStates: [] };
  let edgeIndex = 0;
  for (const edgeLayout of layoutResult.edges) {
    const edgeStyle = edgeStyleFor(edgeLayout);
    edgeStroke.push({ color: edgeStyle.color, strokeWidth: edgeStyle.strokeWidth });
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    // An edge that resolved its own state while being laid out wins over the
    // keyed map (#2756): on the multi-system root the `edgeKey` is shared by every
    // frame that draws the same pair, so the map cannot tell them apart. Layout
    // leaves it unset everywhere else, where the keyed lookup is the answer.
    const diffState = edgeLayout.diffState ?? effectiveEdgeDiffState?.get(edgeKey(edgeLayout));
    // An edge belongs to the selection two ways, and either one is enough to
    // keep it at full strength: it carries the facet itself (#2544), or it
    // touches a member node. The second is why the rule is "dim when *both*
    // endpoints are outside" — where the highlighted set meets the rest of the
    // model is the main thing an overlay is read for.
    // An endpoint is read through its card, so a card sharing its id with a
    // member does not keep its edge lit (#2934); the multi-system root names
    // the card by `fromKey` / `toKey`, every other canvas by the bare id.
    const endpointFacets = (id: string, key: string | undefined): readonly string[] =>
      facetsFor(id, id, layoutResult.nodes.get(key ?? id)?.path);
    const edgeFacets = edgeFacetsFor(edgeLayout);
    const edgeDimmed =
      overlay !== undefined &&
      edgeFacets.length === 0 &&
      endpointFacets(edgeLayout.from, edgeLayout.fromKey).length === 0 &&
      endpointFacets(edgeLayout.to, edgeLayout.toKey).length === 0;
    const rendered = renderEdge(
      edgeLayout,
      edgeStyle,
      markerId,
      diffState,
      hopsByEdge.get(edgeIndex),
      labelPlacements.get(edgeIndex),
      edgeFacets,
      overlay?.colorOf,
      deferredLabels.has(edgeIndex),
      markedEdges.has(edgeIndex) ? edgeIndex : undefined,
    );
    if (edgeDimmed) markState.dimmed.add(edgeIndex);
    markState.diffStates[edgeIndex] = diffState;
    edgeIndex++;
    const withDim = edgeDimmed ? el("g", { opacity: FACET_DIM_OPACITY }, rendered) : rendered;
    const isDimmedGhost =
      edgeLayout.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostEdgeParts.push(withDim);
    } else {
      normalEdgeParts.push(withDim);
    }
  }
  if (ghostEdgeParts.length > 0) {
    parts.push(el("g", { class: "ghost-edges", opacity: GHOST_OPACITY }, ...ghostEdgeParts));
  }
  // Trunk bands under the edges (#2883): the stretches several edges share,
  // drawn as wide as the count they carry. Behind the lines, so a band reads as
  // the backdrop it is and the lines stay what you follow.
  if (layoutResult.crossingMarks && layoutResult.crossingMarks.bands.length > 0) {
    parts.push(
      renderTrunkBands(
        layoutResult.crossingMarks.bands,
        edgeStroke,
        styles.defaultEdgeStyle,
        markState,
      ),
    );
  }
  parts.push(el("g", { class: "edges" }, ...normalEdgeParts));

  // Crossing marks on top of the edges (#1859 P2c-C): hop arcs neutralise
  // right-angle crossings and the merge mark carries the count a trunk goes on
  // to hold. Present only in the Group-by view (ungrouped leaves
  // `crossingMarks` undefined — AC-5).
  if (layoutResult.crossingMarks) {
    const { hops, junctions } = layoutResult.crossingMarks;
    if (hops.length > 0 || junctions.length > 0) {
      parts.push(
        renderCrossingMarks(
          layoutResult.crossingMarks,
          edgeStroke,
          styles.defaultEdgeStyle,
          palette,
          markState,
        ),
      );
    }
  }
  return parts;
}
