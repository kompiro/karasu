/**
 * Lane allocation inside inter-row channels, keyed on the resource rather
 * than on the route shape (#2608; ADR-968 / #996 introduced the pass).
 *
 * A **channel** is the clear horizontal band between two rows of obstacles
 * (cards and group frames). A **run** is a horizontal segment between two
 * interior waypoints whose neighbouring segments are vertical — the part of
 * an orthogonal route that travels along a channel. Whether the route has
 * two waypoints (the interior L of `routeOrthogonalEdges`), four (a mixed
 * gutter route with a channel stub at each end) or ten, every such run takes
 * part here; nothing about the route's shape is consulted (TPL-1954). A
 * segment that ends on a port (`fromPoint` / `toPoint`) is not a run in this
 * sense: moving it would tear the edge off its node, so separating two of
 * those is the port passes' job, not a lane's.
 *
 * Runs sharing a channel get lanes a fixed `LANE_PITCH` apart, centred on
 * the channel's midline. Two runs whose x-ranges are disjoint may share a
 * lane — they never draw over each other — so a channel's *demand* is the
 * largest number of runs that overlap at any x (greedy interval partitioning,
 * the same rule `distributeGutterLanes` applies to gutter corridors), not the
 * number of edges passing through. The pitch never divides the band by N: the old
 * `LANE_BAND / (N + 1)` spacing reached 0.56px at 31 edges and reported
 * success while drawing the edges on top of each other. Room for
 * `N × LANE_PITCH` is instead *reserved* by the placement — `layout()`
 * measures each channel's traffic after the first pass through the chain
 * and re-places once with the row gap grown to fit. Where no reservation
 * exists (the multi-system root view has no canvas-wide row ordinal to key
 * one on) a crowded channel compresses its lanes into the band it has, so
 * they never spill into the rows on either side: pitch without reservation
 * turned overlaps into 113 card penetrations on one measured view, and a
 * penetration is the worse of the two (TPL-1927).
 *
 * Runs after every routing pass and before outline seating.
 */
import type { LayoutEdge, LayoutNode } from "./layout-types.js";
import type { Rect } from "./edge-geometry.js";

/** Vertical distance between two lanes that share a channel (px). */
export const LANE_PITCH = 14;

const EPS = 1e-6;

/** One horizontal run an inter-row channel has to carry. */
export interface ChannelRun {
  edge: LayoutEdge;
  /** The run is `edge.waypoints[i]` → `edge.waypoints[i + 1]`. */
  i: number;
  /** The run's y when it was collected — the router's, before any lane moved it. */
  y: number;
  leftX: number;
  rightX: number;
  /** Lane index inside the channel. */
  lane: number;
}

/** A channel: the band between two rows of obstacles, and the runs inside it. */
export interface Channel {
  /** Bottom of the nearest obstacle above the band; `-Infinity` above the first row. */
  upper: number;
  /** Top of the nearest obstacle below the band; `Infinity` below the last row. */
  lower: number;
  runs: ChannelRun[];
  /** Lanes the runs need: the most of them that overlap at any one x. */
  lanes: number;
}

/**
 * Horizontal clearance two runs sharing a lane keep between them, so the
 * vertical segment ending one run and the one starting the next never meet
 * in a point that reads as a junction.
 */
const LANE_SHARE_GAP = LANE_PITCH;

/**
 * The runs of one edge: every horizontal segment between two interior
 * waypoints whose neighbours on both sides are vertical. Straight edges and
 * pure vertical corridors (a 2-waypoint gutter route) yield none.
 */
export function channelRunsOf(edge: LayoutEdge): Omit<ChannelRun, "lane">[] {
  const wps = edge.waypoints;
  if (!wps || wps.length < 2) return [];
  const pts = [edge.fromPoint, ...wps, edge.toPoint];
  const runs: Omit<ChannelRun, "lane">[] = [];
  // Polyline index k ↔ waypoint index k − 1. Both ends of the run must be
  // interior (1 ≤ k and k + 1 ≤ pts.length − 2), which also guarantees the
  // neighbours pts[k − 1] and pts[k + 2] exist.
  for (let k = 1; k + 1 <= pts.length - 2; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    if (Math.abs(a.y - b.y) > EPS || Math.abs(a.x - b.x) <= EPS) continue;
    if (Math.abs(pts[k - 1].x - a.x) > EPS || Math.abs(pts[k + 2].x - b.x) > EPS) continue;
    runs.push({
      edge,
      i: k - 1,
      y: a.y,
      leftX: Math.min(a.x, b.x),
      rightX: Math.max(a.x, b.x),
    });
  }
  return runs;
}

/**
 * Bucket every routed run by the channel it travels in, and assign each a
 * lane. The key is the band — the nearest obstacle bottom above and top
 * below the run's y — not the run's exact y, so two runs a few pixels apart
 * in the same gap are one channel's traffic, and a run inside a frame is
 * bounded by the frame's rows rather than by the frame (which encloses it
 * and so bounds nothing). Ghost and cyclic edges are not routed and do not
 * count.
 *
 * Lanes are handed out by greedy interval partitioning over the runs' x-ranges
 * in (left end, right end, edge order) — optimal for intervals, and
 * coordinate-derived so the output is deterministic. `lanes` is what the
 * placement reserves room for.
 */
export function collectChannels(
  nodes: Map<string, LayoutNode>,
  edges: readonly LayoutEdge[],
  frames: readonly Rect[],
): Channel[] {
  const obstacles: readonly Rect[] = [...nodes.values(), ...frames];
  type Band = { upper: number; lower: number; runs: Omit<ChannelRun, "lane">[] };
  const bands = new Map<string, Band>();
  for (const edge of edges) {
    if (edge.ghost || edge.cyclic) continue;
    for (const run of channelRunsOf(edge)) {
      const band = bandAround(run.y, obstacles);
      const key = `${band.upper}|${band.lower}`;
      let bucket = bands.get(key);
      if (!bucket) bands.set(key, (bucket = { ...band, runs: [] }));
      bucket.runs.push(run);
    }
  }
  const channels: Channel[] = [];
  for (const { upper, lower, runs } of bands.values()) {
    // Stable sort keeps edge order for ties, so no explicit tiebreak is needed.
    runs.sort((a, b) => a.leftX - b.leftX || a.rightX - b.rightX);
    const laneEnds: number[] = [];
    const laned = runs.map((run) => {
      let lane = laneEnds.findIndex((end) => end + LANE_SHARE_GAP <= run.leftX);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(run.rightX);
      } else {
        laneEnds[lane] = run.rightX;
      }
      return { ...run, lane };
    });
    channels.push({ upper, lower, runs: laned, lanes: laneEnds.length });
  }
  return channels;
}

function bandAround(y: number, obstacles: readonly Rect[]): { upper: number; lower: number } {
  let upper = -Infinity;
  let lower = Infinity;
  for (const r of obstacles) {
    const bottom = r.y + r.height;
    if (bottom <= y + EPS) upper = Math.max(upper, bottom);
    if (r.y >= y - EPS) lower = Math.min(lower, r.y);
  }
  return { upper, lower };
}

/**
 * Move every run of a channel onto its lane: lanes `LANE_PITCH` apart,
 * centred on the channel. A channel that needs a single lane is left exactly
 * where the router put it.
 */
export function distributeChannelLanes(
  nodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  frames: readonly Rect[],
): void {
  for (const channel of collectChannels(nodes, edges, frames)) {
    const { runs, lanes, upper, lower } = channel;
    if (lanes < 2) continue;
    const bounded = Number.isFinite(upper) && Number.isFinite(lower);
    const centre = bounded ? (upper + lower) / 2 : runs[0].y;
    // Fixed pitch whenever the band holds it. The compression below is the
    // documented fallback for a channel nobody reserved room in — see the
    // module comment — and never engages on a canvas the second placement
    // pass has sized.
    const pitch =
      bounded && lanes * LANE_PITCH > lower - upper ? (lower - upper) / lanes : LANE_PITCH;
    for (const run of runs) {
      const y = centre + (run.lane - (lanes - 1) / 2) * pitch;
      const wps = run.edge.waypoints!;
      wps[run.i] = { x: wps[run.i].x, y };
      wps[run.i + 1] = { x: wps[run.i + 1].x, y };
    }
  }
}
