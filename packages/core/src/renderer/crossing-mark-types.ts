import type { Point } from "./edge-geometry.js";

/**
 * A hop arc centred at `(x, y)`, spanning `halfWidth` px either side along the
 * host segment's direction (#1859 P2c-C, oriented in #1939). `angle` is the host
 * segment's direction in **degrees** (0 = horizontal, so an axis-aligned hop
 * renders exactly as before); the arc bumps perpendicular to it. `edge` is the
 * index (into `LayoutResult.edges`) of the host edge, so the renderer can colour
 * the mark like its own edge.
 */
export interface HopMark {
  x: number;
  y: number;
  halfWidth: number;
  angle: number;
  edge: number;
  /**
   * Arc height, when the default `HOP_RADIUS` would leave the arc inside
   * something it is supposed to hop over. Set where the hop rides a trunk band,
   * whose width grows with the count it carries: an arc drawn inside the band is
   * not a smaller mark, it is a crossing that reads as a connection (TPL-2631).
   */
  ry?: number;
}

/**
 * The merge mark at a trunk elbow (#1859 P2c-C, numbered in #2883). `edge` is
 * the index of the joining stub edge, so the mark is coloured like the edge that
 * merges there. `edges` is every edge the spine carries past the mark (the
 * `count` of them), which is what the mark belongs to: hover keeps it bright
 * while any of them is in focus (#3090).
 *
 * `count` is how many edges the spine carries onward from this point, which the
 * renderer draws as the mark itself: a dot says a merge happened, and nothing
 * more, so the line below it reads the same whether it carries two edges or
 * seven. The number and the band's width (see {@link TrunkBand}) always agree.
 *
 * `x` is normally the elbow's own x. It slides along the spine only where the
 * mark would otherwise cover a hop arc, because a covered crossing reads as a
 * connection and this mark asserts exactly that (TPL-2631).
 */
export interface JunctionMark {
  x: number;
  y: number;
  edge: number;
  count: number;
  edges: number[];
}

/**
 * One stretch of a trunk that several edges draw on the same pixels, and how
 * many of them it carries there (#2883).
 *
 * `points` is a polyline, so the spine's last stretch and the shared run into
 * the target come as one band: they carry the same count, and joining them means
 * the corner is a join rather than two butted ends. Drawn under the edges, in
 * the colour of one of them, at a width derived from `count` alone — the stroke
 * width of the edges themselves already means read versus write (ADR-1061), so
 * the band borrows the colour and not the weight. `edges` is every edge the band
 * carries, so it dims only when none of them is in focus (#3090).
 */
export interface TrunkBand {
  points: Point[];
  count: number;
  edge: number;
  edges: number[];
}

/**
 * Marks for the Group-by view: hops (crossing = not connected), junctions
 * (merge = connected, carrying the count), and the bands that give the count a
 * width. Junctions and bands come from shared spines, so a canvas whose edges
 * share none has neither.
 */
export interface CrossingMarks {
  hops: HopMark[];
  junctions: JunctionMark[];
  bands: TrunkBand[];
}
