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
    // A bundle's siblings draw their shared runs on the same pixels (#2958);
    // separating them as overlapping traffic would split the bundle back into
    // parallel lines (TPL-2958). An identical run of the same bundle takes the
    // lane its first sibling got.
    const bundleLane = new Map<string, number>();
    const laned = runs.map((run) => {
      const bundle = run.edge.trunkId ?? run.edge.outTrunkId;
      const key =
        bundle !== undefined ? `${bundle}|${run.y}|${run.leftX}|${run.rightX}` : undefined;
      const shared = key !== undefined ? bundleLane.get(key) : undefined;
      if (shared !== undefined) return { ...run, lane: shared };
      let lane = laneEnds.findIndex((end) => end + LANE_SHARE_GAP <= run.leftX);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(run.rightX);
      } else {
        laneEnds[lane] = run.rightX;
      }
      if (key !== undefined) bundleLane.set(key, lane);
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
 * where the router put it. The lanes are stacked in the order `laneOrder`
 * gives, so a run that carries on upwards sits above one that carries on
 * downwards from the same x (#3088).
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
    const rank = laneOrder(runs, lanes);
    for (const run of runs) {
      const y = centre + (rank[run.lane] - (lanes - 1) / 2) * pitch;
      const wps = run.edge.waypoints!;
      wps[run.i] = { x: wps[run.i].x, y };
      wps[run.i + 1] = { x: wps[run.i + 1].x, y };
    }
  }
}

/**
 * Where each lane of a channel goes, top to bottom: `rank[lane]` (#3088).
 *
 * Lanes are handed out by x-range alone, so two runs that end at one x can come
 * out in either vertical order. When one carries on upwards from that x and the
 * other downwards, the wrong order lays their two verticals over each other for
 * the gap between the lanes: two gutter corridors that only touched, say, and
 * shared a lane on the strength of it. Each such pair asks for the upward run's
 * lane above the downward run's, the way `fanOutGutterPorts` nests a fan by
 * where each edge heads next.
 *
 * Lanes move as whole lanes, so runs that share a lane never meet, and a lane
 * bundle's shared run (#2958) stays one run. With no request the order is the
 * identity, which keeps every such channel byte-identical.
 *
 * Requests can form a cycle: two runs that both end on the same two columns
 * and turn opposite ways at each. No order satisfies it, and one of the two
 * columns keeps an overlap that only moving a column or a gutter lane could
 * remove. The requests are therefore condensed into strongly connected
 * components: the order between components honours every request, ties go to
 * the component holding the lowest lane, and a component lists its own lanes
 * in their original order. Without a cycle every component is a single lane
 * and this is a plain stable topological order.
 */
export function laneOrder(runs: readonly ChannelRun[], lanes: number): number[] {
  const identity = Array.from({ length: lanes }, (_v, l) => l);
  // The lanes whose runs carry on upwards / downwards from each end x.
  const ends = new Map<number, { up: Set<number>; down: Set<number> }>();
  for (const run of runs) {
    const pts = [run.edge.fromPoint, ...run.edge.waypoints!, run.edge.toPoint];
    // The run is pts[a] -> pts[a + 1]; both are interior, so a neighbour
    // exists beyond each end.
    const a = run.i + 1;
    for (const [end, beyond] of [
      [pts[a], pts[a - 1]],
      [pts[a + 1], pts[a + 2]],
    ] as const) {
      const dy = beyond.y - end.y;
      if (Math.abs(beyond.x - end.x) > EPS || Math.abs(dy) <= EPS) continue;
      const key = Math.round(end.x / EPS) * EPS;
      let at = ends.get(key);
      if (!at) ends.set(key, (at = { up: new Set(), down: new Set() }));
      (dy < 0 ? at.up : at.down).add(run.lane);
    }
  }
  // below[l]: the lanes that have to sit below lane l.
  const below: Set<number>[] = identity.map(() => new Set<number>());
  let requests = 0;
  for (const { up, down } of ends.values()) {
    for (const u of up) {
      for (const d of down) {
        if (u === d || below[u].has(d)) continue;
        below[u].add(d);
        requests++;
      }
    }
  }
  if (requests === 0) return identity;

  // Strongly connected components (Tarjan). Lanes are visited in index order,
  // so the numbering is deterministic.
  const comp = new Array<number>(lanes).fill(-1);
  const index = new Array<number>(lanes).fill(-1);
  const low = new Array<number>(lanes).fill(0);
  const onStack = new Array<boolean>(lanes).fill(false);
  const stack: number[] = [];
  let counter = 0;
  let comps = 0;
  const visit = (v: number): void => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (const w of [...below[v]].sort((x, y) => x - y)) {
      if (index[w] === -1) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        comp[w] = comps;
      } while (w !== v);
      comps++;
    }
  };
  for (const v of identity) if (index[v] === -1) visit(v);

  // The condensed order: stable topological order over components, each
  // keyed by the lowest lane it holds, then each component's lanes in order.
  const members: number[][] = Array.from({ length: comps }, () => []);
  for (const l of identity) members[comp[l]].push(l);
  const indegree = new Array<number>(comps).fill(0);
  const next: Set<number>[] = Array.from({ length: comps }, () => new Set<number>());
  for (const u of identity) {
    for (const d of below[u]) {
      if (comp[u] === comp[d] || next[comp[u]].has(comp[d])) continue;
      next[comp[u]].add(comp[d]);
      indegree[comp[d]]++;
    }
  }
  const rank = new Array<number>(lanes).fill(-1);
  const placed = new Array<boolean>(comps).fill(false);
  let position = 0;
  for (let n = 0; n < comps; n++) {
    let pick = -1;
    for (let c = 0; c < comps; c++) {
      if (placed[c] || indegree[c] > 0) continue;
      if (pick === -1 || members[c][0] < members[pick][0]) pick = c;
    }
    placed[pick] = true;
    for (const l of members[pick]) rank[l] = position++;
    for (const c of next[pick]) indegree[c]--;
  }
  return rank;
}
