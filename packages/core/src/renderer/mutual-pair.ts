/**
 * A mutual edge pair drawn as one line (#3027).
 *
 * `A -> B` and `B -> A` between the same two cards are routed as two separate
 * lines, so a dense canvas draws two lines for every two-way dependency. Where
 * the two edges would look the same, this pass draws them as one: the earlier
 * edge's route becomes the shared line, the later edge's route is dropped, and
 * the shared line is split near its middle. Each edge then draws only the half
 * that ends at its own target, with its own arrowhead, so the pair reads as one
 * line with an arrow at each end.
 *
 * Both edges keep their own `LayoutEdge` and `<g>`: canonical id, style,
 * `direction`, diff state and hit-line stay per edge, which is why this is not
 * the logical merge ADR-1185 rejected. Halves rather than two lines stacked on
 * the same pixels, because a stack composes the two edges' looks (dash phase,
 * translucency, facet casing, hop gaps, the pointer target) and so hides which
 * edge a decoration belongs to (TPL-3027).
 *
 * Runs after placement and routing, in place of the one `computeCrossingMarks`
 * call `layout()` makes, so no card moves. A canvas without a pair, or a caller
 * that passes no `edgeLineKey` (the draw.io exporter), computes the marks once,
 * exactly as before (TPL-2174).
 *
 * See docs/design/mutual-edge-pair-merge.md.
 */

import { computeCrossingMarks } from "./crossing-marks.js";
import type { Point } from "./edge-geometry.js";
import type { CrossingMarks, LayoutEdge, LayoutOptions } from "./layout-types.js";

/**
 * How far the split stays from a crossing on the shared line (px), at least.
 * A hop whose gap is wider than this keeps the split out of its gap instead. A
 * split under a hop leaves the gap in one half only, and the other half then
 * runs through the hop and reads as a connection.
 */
const CROSSING_CLEARANCE = 14;
/** How far the split stays from a corner (px): two butt ends meeting on a corner leave a notch. */
const CORNER_CLEARANCE = 10;
/**
 * The split stays within the middle two-thirds of the shared line. Measured on
 * the Umami fixture: the middle third merged 11 of 14 pairs, the middle half 13,
 * the middle two-thirds all 14 (design doc, step 3).
 */
const SPLIT_WINDOW = 1 / 6;
const EPS = 1e-6;

type Line = Point[];

const lineOf = (e: LayoutEdge): Line => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * True for an endpoint a collapse folded into a stub: a category stub
 * (`__collapsed_*`) or a team stub (`__group_collapsed_*`), bare or
 * system-qualified. A stub edge stands for several re-targeted edges with their
 * diff states and facets folded, so it is left as it is.
 */
function isCollapseStub(id: string): boolean {
  return /(^|\.)__(group_)?collapsed_/.test(id);
}

/**
 * Layout marks that change how an edge is drawn without reaching the style key:
 * a ghost is dimmed, a cyclic edge is a back-arc, a `groupBackward` edge is
 * dashed, a trunked edge shares its spine, and a parallel bundle slides its
 * labels. Any of them keeps the edge as its own line.
 */
function eligible(e: LayoutEdge): boolean {
  return (
    e.ghost !== true &&
    e.cyclic !== true &&
    e.groupBackward !== true &&
    e.trunkId === undefined &&
    e.outTrunkId === undefined &&
    e.bundleSize === undefined &&
    e.from !== e.to &&
    !isCollapseStub(e.from) &&
    !isCollapseStub(e.to)
  );
}

/**
 * The card an endpoint names. On the multi-system root an intra-system edge
 * carries the (system, id) key, so two systems that both hold an `Api` and a
 * `Store` never pair across systems (TPL-1352); a cross-system edge carries no
 * key and so never pairs with an intra-system one.
 */
const endpoint = (e: LayoutEdge, end: "from" | "to") =>
  end === "from" ? (e.fromKey ?? e.from) : (e.toKey ?? e.to);

/**
 * The mutual pairs that may be drawn as one line, as `[earlier, later]` indices
 * into `edges`. Both edges must be of the same kind and return the same line key
 * (colour, width, stroke style and diff state, resolved by the renderer).
 */
export function findMutualPairs(
  edges: readonly LayoutEdge[],
  lineKey: (edge: LayoutEdge) => string | undefined,
): [number, number][] {
  const byEnds = new Map<string, number[]>();
  edges.forEach((e, k) => {
    const key = `${endpoint(e, "from")}\u0000${endpoint(e, "to")}`;
    const list = byEnds.get(key);
    if (list) list.push(k);
    else byEnds.set(key, [k]);
  });
  const pairs: [number, number][] = [];
  edges.forEach((a, i) => {
    const forward = byEnds.get(`${endpoint(a, "from")}\u0000${endpoint(a, "to")}`) ?? [];
    const reverse = byEnds.get(`${endpoint(a, "to")}\u0000${endpoint(a, "from")}`) ?? [];
    // One edge each way, so the pair cannot be confused with a bundle.
    if (forward.length !== 1 || reverse.length !== 1) return;
    const j = reverse[0];
    if (j <= i) return;
    const b = edges[j];
    if (!eligible(a) || !eligible(b)) return;
    if ((a.fromKey === undefined) !== (b.fromKey === undefined)) return;
    if (a.kind !== b.kind) return;
    const ka = lineKey(a);
    if (ka === undefined || ka !== lineKey(b)) return;
    pairs.push([i, j]);
  });
  return pairs;
}

/** Strict-interior crossing point of two segments, as `t` along the first. */
function crossingT(a: Point, b: Point, c: Point, d: Point): number | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return undefined;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  const len1 = Math.hypot(rx, ry);
  const len2 = Math.hypot(sx, sy);
  if (t * len1 <= EPS || (1 - t) * len1 <= EPS || u * len2 <= EPS || (1 - u) * len2 <= EPS) {
    return undefined;
  }
  return t;
}

/** Where along `line` (arc length) `p` lies, or `undefined` when it is off the line. */
function positionOn(line: Line, p: Point): number | undefined {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const len = dist(a, b);
    if (len > EPS) {
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
      if (t >= -EPS && t <= 1 + EPS) {
        const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        if (dist(p, q) < 0.5) return acc + t * len;
      }
    }
    acc += len;
  }
  return undefined;
}

/**
 * The split point for `line`, as arc length, or `undefined` when no point in the
 * middle two-thirds keeps clear of every crossing gap and every corner.
 *
 * `shared` is the line's index in the array `marks` was computed on, so the
 * hops it hosts can be told from the hops other lines host over it.
 */
export function chooseSplit(
  line: Line,
  others: readonly Line[],
  marks: CrossingMarks,
  shared: number,
): number | undefined {
  const lengths = line.slice(1).map((p, i) => dist(line[i], p));
  const total = lengths.reduce((s, l) => s + l, 0);
  if (total <= EPS) return undefined;
  // Forbidden stretches as (centre, half-width) along the line.
  const forbidden: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    if (i > 0) forbidden.push([acc, CORNER_CLEARANCE]);
    for (const other of others) {
      for (let k = 0; k + 1 < other.length; k++) {
        const t = crossingT(line[i], line[i + 1], other[k], other[k + 1]);
        if (t !== undefined) forbidden.push([acc + t * lengths[i], CROSSING_CLEARANCE]);
      }
    }
    acc += lengths[i];
  }
  for (const hop of marks.hops) {
    const at = positionOn(line, hop);
    if (at === undefined) continue;
    // A hop the shared line hosts gaps it by `halfWidth` either side. A hop
    // another line hosts arches over it, `ry` high.
    const reach = hop.edge === shared ? hop.halfWidth : (hop.ry ?? 0);
    forbidden.push([at, Math.max(CROSSING_CLEARANCE, reach)]);
  }
  const lo = total * SPLIT_WINDOW;
  const hi = total * (1 - SPLIT_WINDOW);
  const mid = total / 2;
  const clear = (s: number) =>
    s >= lo - EPS && s <= hi + EPS && forbidden.every(([c, half]) => Math.abs(s - c) >= half - EPS);
  // The nearest clear point to the middle is the middle itself or the edge of
  // a forbidden stretch, so those are the only candidates to try.
  const candidates = [mid, ...forbidden.flatMap(([c, half]) => [c - half, c + half])];
  let best: number | undefined;
  for (const s of candidates) {
    if (!clear(s)) continue;
    const d = Math.abs(s - mid);
    const bd = best === undefined ? Infinity : Math.abs(best - mid);
    if (d < bd - EPS || (Math.abs(d - bd) <= EPS && best !== undefined && s < best)) best = s;
  }
  return best;
}

/** `line` cut at arc length `s` into the part before and the part after the split point. */
function splitAt(line: Line, s: number): [Line, Line] {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const len = dist(line[i], line[i + 1]);
    if (acc + len >= s) {
      const t = (s - acc) / len;
      const m = {
        x: line[i].x + t * (line[i + 1].x - line[i].x),
        y: line[i].y + t * (line[i + 1].y - line[i].y),
      };
      return [
        [...line.slice(0, i + 1), m],
        [m, ...line.slice(i + 1)],
      ];
    }
    acc += len;
  }
  return [line, [line[line.length - 1]]];
}

function setLine(e: LayoutEdge, line: Line): void {
  e.fromPoint = line[0];
  e.toPoint = line[line.length - 1];
  e.waypoints = line.length > 2 ? line.slice(1, -1) : undefined;
  e.pairHalf = true;
}

/** `marks`, computed on `kept`, with every edge index mapped back to `edges`. */
function remapMarks(marks: CrossingMarks, kept: readonly number[]): CrossingMarks {
  const back = (k: number) => kept[k];
  return {
    hops: marks.hops.map((h) => ({ ...h, edge: back(h.edge) })),
    junctions: marks.junctions.map((j) => ({ ...j, edge: back(j.edge), edges: j.edges.map(back) })),
    bands: marks.bands.map((b) => ({ ...b, edge: back(b.edge), edges: b.edges.map(back) })),
  };
}

/**
 * Draw every eligible mutual pair in `edges` as one line split in halves, and
 * return the crossing marks for the result. Rewrites the paired edges' routes in
 * place; every other edge is untouched.
 *
 * The split has to keep clear of the hops, and a hop's final width is only known
 * once `computeCrossingMarks` has run on the routes that will be drawn (close
 * crossings merge into one wider hop, a trunk band widens the hops on it). So
 * the marks are computed with the dropped routes left out, the splits are chosen
 * against them, and a pair that finds no split goes back to two lines. Its route
 * may add a crossing near another pair's split, so the marks are computed again
 * until no pair goes back. Pairs only ever leave, so this ends.
 *
 * The marks from the last run are the ones drawn: a split is outside every gap,
 * so a hop on the shared line lies wholly on one half and only its owner changes.
 */
export function applyMutualPairs(
  edges: LayoutEdge[],
  { edgeLineKey }: Pick<LayoutOptions, "edgeLineKey">,
): CrossingMarks {
  let pairs = edgeLineKey ? findMutualPairs(edges, edgeLineKey) : [];
  for (;;) {
    const dropped = new Set(pairs.map(([, j]) => j));
    const kept = edges.map((_, k) => k).filter((k) => !dropped.has(k));
    const marks = computeCrossingMarks(dropped.size === 0 ? edges : kept.map((k) => edges[k]));
    if (pairs.length === 0) return marks;
    const keptAt = new Map(kept.map((k, at) => [k, at]));
    const splits = new Map<number, number>();
    const stay = pairs.filter(([i]) => {
      const shared = lineOf(edges[i]);
      const others = kept.filter((k) => k !== i).map((k) => lineOf(edges[k]));
      const s = chooseSplit(shared, others, marks, keptAt.get(i)!);
      if (s !== undefined) splits.set(i, s);
      return s !== undefined;
    });
    if (stay.length < pairs.length) {
      pairs = stay;
      continue;
    }
    const drawn = remapMarks(marks, kept);
    for (const [i, j] of pairs) {
      const shared = lineOf(edges[i]);
      const s = splits.get(i)!;
      // A hop on the shared line belongs to the half it lies on.
      for (const hop of drawn.hops) {
        if (hop.edge !== i) continue;
        const at = positionOn(shared, hop);
        if (at !== undefined && at < s) hop.edge = j;
      }
      const [before, after] = splitAt(shared, s);
      setLine(edges[i], after); // split -> i.to
      setLine(edges[j], [...before].reverse()); // split -> i.from, which is j.to
    }
    return drawn;
  }
}

/**
 * The segment a paired half's label sits on by default: the longest one that
 * does not touch the split (segment 0 starts there). A label beside the split
 * would sit between the two arrows and read as either edge's. `undefined` for a
 * one-segment half, whose default anchor is already that segment's midpoint,
 * and for a half whose other segments have no length (no direction to show).
 */
export function pairLabelSegment(edge: LayoutEdge): number | undefined {
  const line = lineOf(edge);
  let best: number | undefined;
  let bestLen = EPS;
  for (let i = 1; i + 1 < line.length; i++) {
    const len = dist(line[i], line[i + 1]);
    if (len > bestLen + EPS) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}
