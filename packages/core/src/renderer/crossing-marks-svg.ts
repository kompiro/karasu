import type { CrossingMarks, TrunkBand } from "./layout-types.js";
import { HOP_RADIUS, JUNCTION_CHIP_RADIUS, trunkBandHalfWidth } from "./crossing-marks.js";
import { el } from "./svg-builder.js";
import type { DiagramPalette } from "./palette.js";
import { FACET_DIM_OPACITY } from "./facet-overlay.js";
import { round2 } from "./svg-number.js";

/**
 * Render the Group-by crossing marks layer (#1859 P2c-C). Emitted above the edge
 * layer so marks sit on top of the lines.
 *
 * - **hop**: an arc subpath that bumps *over* the crossing (crossing = NOT
 *   connected), centred at `(x, y)` and oriented along the host segment via
 *   `angle` (degrees). Elliptical (`rx = halfWidth`, `ry = HopMark.ry` or
 *   {@link HOP_RADIUS}) so a clustered wide hop stays a shallow bump;
 *   `sweep = 1` bumps to one side. An axis-aligned hop (`angle = 0`) renders
 *   exactly as the pre-#1939 flat bump. The arc's own `ry` is what makes it
 *   rise out of a trunk band: drawing the constant here instead left a widened
 *   arc flat inside the band it hops, which reads as a connection (#2884).
 *   Consecutive hops of one edge and stroke share a `<path>` ({@link continuesHopRun}).
 * - **junction**: the merge mark at a trunk elbow (merge = connected), drawn as
 *   a chip carrying the number of edges the spine holds onward from there
 *   (#2883). A bare dot said only that a merge happened, which left the line
 *   below it reading the same whether it carried two edges or seven.
 * - **band**: the stretch of spine (and the shared run into the target) that
 *   several edges draw on the same pixels, as wide as the count it carries.
 *   Drawn under the edges by {@link renderTrunkBands}, not here.
 *
 * Each mark is drawn in its owning edge's resolved colour (and the hop in that
 * edge's stroke width) via `edgeStroke[mark.edge]`, so marks stay visually part
 * of the lines they annotate on a colour-styled diagram; `fallback` covers an
 * out-of-range index. Coordinates are rounded to 2 decimals so tiny float noise
 * never destabilises the SVG snapshot.
 *
 * Every mark names the edges it belongs to in `data-edges` (space-separated
 * indices, matching the `data-edge-index` of those edges), so the app can dim a
 * mark with its edges on hover (#3090). Only attributes are added: the marks keep
 * this layer and their order (TPL-2956).
 *
 * Scope: crossings in any *single-system* view (right-angle and, since #1939,
 * diagonal; grouped and, since #1956, ungrouped). The multi-system view is
 * extended separately (#1939 Part 2).
 */
export function renderCrossingMarks(
  marks: CrossingMarks,
  edgeStroke: { color: string; strokeWidth: number }[],
  fallback: { color: string; strokeWidth: number },
  palette: DiagramPalette,
  state: MarkState,
): string {
  const r = round2;
  const strokeOf = (edge: number) => edgeStroke[edge] ?? fallback;
  const parts: string[] = [];
  // Consecutive hops that share an edge and a stroke are one `<path>` with a
  // subpath per hop (#2956, per edge since #3090): hops were 43% of a dense
  // diagram's SVG, one element apiece.
  let run: (HopRun & { d: string[] }) | undefined;
  const flushRun = () => {
    if (!run) return;
    const edges = [run.edge];
    parts.push(
      followEdges(
        el("path", {
          d: run.d.join(" "),
          fill: "none",
          stroke: run.stroke.color,
          "stroke-width": run.stroke.strokeWidth,
          "data-edges": run.edge,
          "data-diff-state": markDiffState(state, edges),
        }),
        state,
        edges,
      ),
    );
    run = undefined;
  };
  for (const hop of marks.hops) {
    const rad = (hop.angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const x0 = r(hop.x - hop.halfWidth * c);
    const y0 = r(hop.y - hop.halfWidth * s);
    const x1 = r(hop.x + hop.halfWidth * c);
    const y1 = r(hop.y + hop.halfWidth * s);
    const next: HopRun = { edge: hop.edge, stroke: strokeOf(hop.edge) };
    if (!run || !continuesHopRun(run, next)) {
      flushRun();
      run = { ...next, d: [] };
    }
    run.d.push(
      `M ${x0} ${y0} A ${r(hop.halfWidth)} ${r(hop.ry ?? HOP_RADIUS)} ${r(hop.angle)} 0 1 ${x1} ${y1}`,
    );
  }
  flushRun();
  for (const j of marks.junctions) {
    const stroke = strokeOf(j.edge);
    // On both elements: a `<g>` around the pair would nest inside the layer.
    const edges = j.edges.join(" ");
    // Punched out of the canvas so the chip reads as a marker on the line rather
    // than a node sitting behind it, which is why it needs the palette.
    const diff = markDiffState(state, j.edges);
    parts.push(
      followEdges(
        el("circle", {
          cx: r(j.x),
          cy: r(j.y),
          r: JUNCTION_CHIP_RADIUS,
          fill: palette.canvasBg,
          stroke: stroke.color,
          "stroke-width": stroke.strokeWidth,
          "data-edges": edges,
          "data-diff-state": diff,
        }),
        state,
        j.edges,
      ),
      followEdges(
        el(
          "text",
          {
            x: r(j.x),
            y: r(j.y + JUNCTION_COUNT_BASELINE),
            "text-anchor": "middle",
            fill: stroke.color,
            "font-size": `${JUNCTION_COUNT_FONT_SIZE}px`,
            "font-family": "sans-serif",
            "data-edges": edges,
            "data-diff-state": diff,
          },
          String(j.count),
        ),
        state,
        j.edges,
      ),
    );
  }
  return el("g", { class: "crossing-marks" }, ...parts);
}

/**
 * What a crossing mark takes from the edges it belongs to (#3157), by edge index:
 * the edges the facet overlay dims, and each edge's diff state. A mark is dimmed
 * only when every one of its edges is, the rule hover follows (#3090): a band or
 * chip that carries one lit edge stays lit.
 */
export interface MarkState {
  dimmed: Set<number>;
  diffStates: (string | undefined)[];
}

/**
 * `mark` wrapped in the facet overlay's dim when every edge it belongs to is
 * dimmed. One wrapper per element, so the marks keep their order (TPL-2956).
 */
function followEdges(mark: string, state: MarkState, edges: readonly number[]): string {
  const dimmed = edges.length > 0 && edges.every((e) => state.dimmed.has(e));
  return dimmed ? el("g", { opacity: FACET_DIM_OPACITY }, mark) : mark;
}

/**
 * `unchanged` when every edge a mark belongs to is unchanged in compare mode,
 * so the diff stylesheet dims it with them; otherwise no attribute, and with
 * diff mode off there is never one (TPL-2174).
 */
function markDiffState(state: MarkState, edges: readonly number[]): string | undefined {
  return edges.length > 0 && edges.every((e) => state.diffStates[e] === "unchanged")
    ? "unchanged"
    : undefined;
}

/** What one hop `<path>` holds in common: the host edge and its stroke. */
interface HopRun {
  edge: number;
  stroke: { color: string; strokeWidth: number };
}

/**
 * Where one hop `<path>` ends and the next begins: a hop joins the path before it
 * when this holds for the previous hop and itself (#2956). Only *consecutive*
 * hops merge, never every hop of one stroke, because SVG paints later elements
 * on top: pulling a stroke's later hops forward to its first one would flip
 * which of two overlapping hops of different colours is on top (4,757 such
 * pairs on the Dify model, TPL-2956).
 *
 * A run is also one edge's, because the path carries that edge in `data-edges`
 * and hover dims the hops with their edge (#3090). A hop bridges a gap in its
 * host edge's line, so it is part of that line: a path shared by two edges
 * would stay bright for both. This is option 3 of the #2956 design, about +2%
 * output on Dify.
 */
function continuesHopRun(prev: HopRun, next: HopRun): boolean {
  return (
    prev.edge === next.edge &&
    prev.stroke.color === next.stroke.color &&
    prev.stroke.strokeWidth === next.stroke.strokeWidth
  );
}

/**
 * The edges some crossing mark belongs to. Only these get `data-edge-index`,
 * which is all hover needs to match an edge to its marks (#3090).
 */
export function edgesWithMarks(marks: CrossingMarks | undefined): Set<number> {
  const edges = new Set<number>();
  if (!marks) return edges;
  for (const hop of marks.hops) edges.add(hop.edge);
  for (const mark of [...marks.junctions, ...marks.bands]) {
    for (const edge of mark.edges) edges.add(edge);
  }
  return edges;
}

/** Type size of the numeral in a merge mark, and its baseline offset. */
const JUNCTION_COUNT_FONT_SIZE = 10;
const JUNCTION_COUNT_BASELINE = 3.5;
/**
 * How far short of the target the band stops, so it does not swallow the
 * arrowhead the edges draw there.
 */
const BAND_ARROW_CLEARANCE = 12;

/**
 * The trunk bands: each stretch that several edges draw on the same pixels,
 * as wide as the count it carries (#2883).
 *
 * Drawn *under* the edges, so the lines stay the thing you follow and the band
 * is the thing you read a count off. One `<polyline>` per stretch, which is what
 * makes the corner into the target a join rather than two butted ends.
 */
export function renderTrunkBands(
  bands: readonly TrunkBand[],
  edgeStroke: { color: string; strokeWidth: number }[],
  fallback: { color: string; strokeWidth: number },
  state: MarkState,
): string {
  const r = round2;
  const parts: string[] = [];
  for (const band of bands) {
    const stroke = edgeStroke[band.edge] ?? fallback;
    const points = [...band.points];
    // Pull the last point back along its own segment: that end is the port the
    // edges' arrowheads land on.
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const len = Math.hypot(last.x - prev.x, last.y - prev.y);
    if (len > BAND_ARROW_CLEARANCE) {
      const t = (len - BAND_ARROW_CLEARANCE) / len;
      points[points.length - 1] = {
        x: prev.x + (last.x - prev.x) * t,
        y: prev.y + (last.y - prev.y) * t,
      };
    }
    parts.push(
      followEdges(
        el("polyline", {
          points: points.map((p) => `${r(p.x)},${r(p.y)}`).join(" "),
          fill: "none",
          stroke: stroke.color,
          "stroke-width": r(trunkBandHalfWidth(band.count) * 2),
          "stroke-linejoin": "miter",
          "stroke-opacity": TRUNK_BAND_OPACITY,
          "data-edges": band.edges.join(" "),
          "data-diff-state": markDiffState(state, band.edges),
        }),
        state,
        band.edges,
      ),
    );
  }
  return el("g", { class: "trunk-bands" }, ...parts);
}

/**
 * Bands sit behind the lines, so they read as a backdrop and not as an edge.
 * A stroke opacity, not `opacity`: hover dims a band with a CSS `opacity`, which
 * would replace an `opacity` attribute and leave the band at 0.12 against lines
 * dimmed from 1 to 0.12. On one unfilled polyline the two look the same (#3090).
 */
const TRUNK_BAND_OPACITY = 0.4;
