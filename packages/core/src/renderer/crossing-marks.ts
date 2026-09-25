/**
 * Crossing marks for the Group-by system view (#1859 P2c-C, generalised in #1939).
 *
 * `computeCrossingMarks` derives two marks that disambiguate line meetings *by
 * representation* (the circuit-diagram convention), so a crossing can never be
 * misread as a connection:
 *
 *   - **hop (◠)**: where a segment crosses a segment of a *different* edge, an
 *     arc bumps *over* the crossing — "crossing, NOT connected". The arc rides
 *     the **more horizontal** of the two segments and is oriented along it, so a
 *     vertical gutter corridor / trunk spine stays a clean straight through-line.
 *     Axis-aligned right-angle crossings (the common case after orthogonal
 *     routing) render exactly as before — a flat horizontal bump (angle 0).
 *     Diagonal crossings (rare "clear" intra-band edges left straight) now also
 *     get an oriented hop (#1939 Part 1, approach C — no routing change).
 *   - **junction (●)**: a trunk stub-join elbow (`waypoints[0]`) gets a connection
 *     dot — "merge = connected" — but only where the spine continues past it (a
 *     T/＋). The topmost stub of a trunk is the spine head, a plain L-corner, and
 *     gets no dot (circuit convention: dots mark connections, not bends).
 *
 * Crossings use a **strict-interior** segment intersection (`1e-6` epsilon) so a
 * stub *ending* on a spine (a trunk join) or an edge's own corner — both
 * endpoints, not interior — is correctly NOT a hop. Marks are derived from final
 * coordinates only, so they are deterministic and snapshot-stable.
 *
 * See docs/design/system-view-grouping.md § "P2c-C 詳細設計" / "P2c カバレッジ拡張（#1939）".
 */

import type {
  CrossingMarks,
  HopMark,
  JunctionMark,
  LayoutEdge,
  TrunkBand,
} from "./layout-types.js";
import type { Point } from "./edge-geometry.js";
import { BoxGrid, chooseCellSize } from "./spatial-grid.js";

/**
 * The band that shows how many edges a trunk stretch carries: this wide for one
 * edge, plus {@link TRUNK_BAND_PITCH} for each further edge, up to a cap so a
 * very wide fan-in stays a band rather than a slab. Derived from the count
 * alone: the edges' own stroke width already means read versus write
 * (ADR-1061), so the band borrows their colour and not their weight.
 */
const TRUNK_BAND_BASE = 2;
const TRUNK_BAND_PITCH = 3;
const TRUNK_BAND_MAX_STEPS = 8;
/** Half the width of the band that carries `count` edges. */
export function trunkBandHalfWidth(count: number): number {
  return (TRUNK_BAND_BASE + Math.min(count - 1, TRUNK_BAND_MAX_STEPS) * TRUNK_BAND_PITCH) / 2;
}
/** Clearance a mark needs to stay outside a band of `count` edges. */
const BAND_CLEARANCE = 3;

/**
 * Radius of a single hop arc's bump (px).
 *
 * 4px was chosen when nothing competed with the arc. At 6x zoom on a 10k-line
 * model it reads as a nick in the line rather than a mark, and the mark exists
 * so a crossing is not mistaken for a connection (ADR-1859), so it was raised
 * to 6 (#2884).
 *
 * 6 is the ceiling, not a preference. What binds is the spacing of the ports
 * {@link fanOutGutterPorts} lays along one card side — side length over count,
 * which falls to ~9.6px on a crowded side — so a taller arc reaches the
 * neighbouring parallel line instead of the one it hops. Measured on the
 * reverse-engineered dify model, arcs reaching a neighbour go 0 -> 36 in the
 * grouped view between 8 and 9. Raising this past 6 means flooring the port fan
 * first, which is a placement change. `hopArcFitsBetweenPorts` in
 * `routing-parity.test.ts` fails on a raise so the reason has to be restated.
 */
export const HOP_RADIUS = 6;
/**
 * Crossings on the same host segment closer than this (in px along the segment)
 * merge into one wide hop (design doc: `HOP_CLUSTER_GAP`, hop-radius-derived).
 * Coordinate-derived so the mark set stays deterministic.
 */
export const HOP_CLUSTER_GAP = HOP_RADIUS * 2;
/**
 * Radius of the merge mark. It used to be a bare 2.5px dot; it now carries the
 * count the spine goes on to hold (#2883), so it is the size of a chip with a
 * numeral in it.
 */
export const JUNCTION_CHIP_RADIUS = 9;

const EPS = 1e-6;

/**
 * A drawable edge segment with a **canonical** unit direction (`ux > 0`, or
 * pointing down for a vertical). Canonicalising the direction — independent of
 * which way the edge was drawn — keeps a horizontal segment at angle 0 so its
 * hop renders byte-identically to the pre-#1939 axis-aligned output.
 */
interface Seg {
  a: Point;
  b: Point;
  edge: number;
  ux: number;
  uy: number;
  /** `Math.hypot(b.x - a.x, b.y - a.y)`, the value `segIntersection` needs for its endpoint test. */
  len: number;
  /** Closed axis-aligned bounds — the grid key and the exact AABB reject share these values. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Strict-interior intersection point of segments `s1` and `s2`, or null. Parallel
 * / collinear segments never intersect at a point (no crossing to mark). A
 * crossing within `EPS` **px** of either segment's endpoint is excluded — that is
 * a connection (trunk join / shared corner), not a cross. The endpoint test is in
 * absolute pixels (not a parametric `t` fraction) so it matches the pre-#1939
 * axis-aligned epsilon exactly and keeps that output byte-identical.
 */
function segIntersection(s1: Seg, s2: Seg): Point | null {
  const rx = s1.b.x - s1.a.x;
  const ry = s1.b.y - s1.a.y;
  const sx = s2.b.x - s2.a.x;
  const sy = s2.b.y - s2.a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < EPS) return null; // parallel / collinear
  const qpx = s2.a.x - s1.a.x;
  const qpy = s2.a.y - s1.a.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const len1 = s1.len;
  const len2 = s2.len;
  // Distance from the crossing to each endpoint = t·len / (1−t)·len etc. A
  // negative value (out-of-segment) is also ≤ EPS, so this rejects both
  // endpoint-touches and off-segment intersections in one test.
  if (t * len1 <= EPS || (1 - t) * len1 <= EPS || u * len2 <= EPS || (1 - u) * len2 <= EPS) {
    return null;
  }
  return { x: s1.a.x + t * rx, y: s1.a.y + t * ry };
}

/**
 * Broad-phase index over the segment bounds, spanning the extent of all
 * segments with cells sized by `chooseCellSize` from the segment lengths (a
 * typical segment covers about one cell; a long spine covers a row of them).
 * Every segment is inserted from the same list the pair loop reads, never a
 * shape-specific subset (TPL-1954).
 */
function segmentGrid(segs: Seg[]): BoxGrid {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const lengths = new Float64Array(segs.length);
  segs.forEach((s, i) => {
    if (s.minX < minX) minX = s.minX;
    if (s.minY < minY) minY = s.minY;
    if (s.maxX > maxX) maxX = s.maxX;
    if (s.maxY > maxY) maxY = s.maxY;
    lengths[i] = Math.hypot(s.maxX - s.minX, s.maxY - s.minY);
  });
  const cell = chooseCellSize(lengths, maxX - minX, maxY - minY);
  const grid = new BoxGrid(cell, minX, minY, maxX, maxY);
  segs.forEach((s, i) => grid.insert(i, s.minX, s.minY, s.maxX, s.maxY));
  return grid;
}

/**
 * Derive hop and junction marks from the final edge geometry. Every single-system
 * layout calls this — grouped and, since #1956, ungrouped (Group by: none). The
 * ungrouped view has no aggregation trunks, so it gets hops only (no junctions).
 */
export function computeCrossingMarks(edges: LayoutEdge[]): CrossingMarks {
  const { hops, junctions, trunks } = detectMarks(edges);
  const bands = bandsOf(trunks);
  clearMarksOfBands(hops, junctions, bands, trunks);

  // Stable order → deterministic SVG output. `detectMarks` already ordered the
  // hops and the counts; the band pass can move a count, so sort them again.
  junctions.sort((a, b) => a.y - b.y || a.x - b.x);
  bands.sort(
    (a, b) => a.points[0].y - b.points[0].y || a.points[0].x - b.points[0].x || a.count - b.count,
  );
  return { hops, junctions, bands };
}

/** One trunk's spine: where each sibling joins, and where the spine ends. */
interface TrunkGroup {
  x: number;
  entries: { y: number; edge: number }[];
  endY: number;
  entryX: number;
}

/**
 * Which crossings and merges exist, before anything a band forces on them.
 *
 * Split out because this is the claim the spatial prefilter makes (#2760): the
 * grid must find exactly the crossings the all-pairs loop finds. The band pass
 * that follows moves and resizes marks by geometry the prefilter has no say in.
 */
export function detectMarks(edges: LayoutEdge[]): {
  hops: HopMark[];
  junctions: JunctionMark[];
  trunks: TrunkGroup[];
} {
  const segs: Seg[] = [];
  // Trunk stub-join elbows grouped by spine (`trunkId` @ spine x). Each edge's
  // `waypoints[0]` is where its stub joins the shared vertical spine; `edge` is
  // that stub's index so its junction dot can be coloured like the edge.
  const trunkElbows = new Map<
    string,
    {
      x: number;
      entries: { y: number; edge: number }[];
      /** y where the spine ends, the same point for every sibling. */
      endY: number;
      /** x of the shared entry on the target, so the band can turn into it. */
      entryX: number;
    }
  >();

  edges.forEach((edge, edgeIdx) => {
    // Ghost/cyclic edges are peripheral (dimmed / nudged perpendicular) and are
    // not part of the orthogonal grouped route set, so they carry no marks.
    if (edge.ghost || edge.cyclic) return;

    const pts: Point[] = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < EPS) continue; // zero-length
      // Canonical unit direction: ux > 0, or (vertical) uy > 0. Independent of
      // draw order, so a horizontal segment is always (1, 0) → angle 0.
      let ux = (b.x - a.x) / len;
      let uy = (b.y - a.y) / len;
      if (ux < -EPS || (Math.abs(ux) < EPS && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      segs.push({
        a,
        b,
        edge: edgeIdx,
        ux,
        uy,
        len,
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      });
    }

    // Junction candidate: the elbow where a trunked edge's stub joins the spine.
    if (edge.trunkId !== undefined && edge.waypoints && edge.waypoints.length > 0) {
      const elbow = edge.waypoints[0];
      const key = `${edge.trunkId}@${elbow.x}`;
      const group = trunkElbows.get(key);
      if (group) group.entries.push({ y: elbow.y, edge: edgeIdx });
      else {
        // Walk the spine from the elbow: every point that keeps the spine's x is
        // still on it, and the first one that leaves is where it turns into the
        // target. Counting waypoints instead would assume a four-point route,
        // which is one shape this can take and not the only one.
        let k = 1;
        while (k + 1 < pts.length && Math.abs(pts[k + 1].x - elbow.x) < EPS) k++;
        trunkElbows.set(key, {
          x: elbow.x,
          entries: [{ y: elbow.y, edge: edgeIdx }],
          endY: pts[k].y,
          entryX: k + 1 < pts.length ? pts[k + 1].x : pts[k].x,
        });
      }
    }
  });

  // Assign each strict-interior crossing to the **more horizontal** of the two
  // segments (larger |ux|; tie → smaller edge index, then segment order), so the
  // arc rides the flatter line and steep spines stay clean. `coord` is the
  // crossing's 1-D position along the host's canonical direction, for clustering.
  //
  // Pairs come from a uniform grid over the segment bounds instead of the full
  // `i < j` double loop (#2760): only segments sharing a grid cell can have
  // overlapping bounds, so the exact AABB reject below sees a small superset of
  // the pairs it used to accept and rejects exactly the same ones. The visiting
  // order is preserved — `i` ascending, then each `i`'s candidates ascending —
  // because it is observable: it fixes the insertion order of `crossingsPerHost`
  // (hence the hop-dedupe tie-break in `addHop`) and of each host's list.
  const crossingsPerHost = new Map<Seg, { coord: number; point: Point }[]>();
  const grid = segmentGrid(segs);
  const candidates: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s1 = segs[i];
    grid.query(s1.minX, s1.minY, s1.maxX, s1.maxY, candidates);
    let n = 0;
    for (const j of candidates) if (j > i) candidates[n++] = j;
    candidates.length = n;
    candidates.sort((a, b) => a - b);
    for (const j of candidates) {
      const s2 = segs[j];
      if (s1.edge === s2.edge) continue;
      // Exact AABB reject before the intersection maths: segments whose bounding
      // boxes don't overlap can't cross. Strict, so touching boxes still reach
      // `segIntersection` — the grid's closed-interval cells never drop those.
      if (s1.minX > s2.maxX || s1.maxX < s2.minX || s1.minY > s2.maxY || s1.maxY < s2.minY) {
        continue;
      }
      const p = segIntersection(s1, s2);
      if (!p) continue;
      const host =
        s1.ux > s2.ux + EPS || (Math.abs(s1.ux - s2.ux) < EPS && s1.edge <= s2.edge) ? s1 : s2;
      const coord = p.x * host.ux + p.y * host.uy;
      const list = crossingsPerHost.get(host);
      if (list) list.push({ coord, point: p });
      else crossingsPerHost.set(host, [{ coord, point: p }]);
    }
  }

  // Cluster crossings that sit close along one host segment into a single wide
  // hop, oriented along the host. Dedup by **point** (not point+angle), keeping
  // the widest: collinear hosts crossing at the same spot, and 3+ edges
  // concurrent at one point, collapse to a single arc instead of stacking.
  // Keyed by the exact (x, y) doubles, x then y — a dense canvas produces
  // hundreds of thousands of hops per render, and a string key per hop was the
  // pass's single largest cost once the pair loop was indexed (#2760). Number
  // keys compare by value exactly as the `${x},${y}` strings did.
  const hopByX = new Map<number, Map<number, HopMark>>();
  let hopCount = 0;
  const addHop = (mark: HopMark) => {
    let byY = hopByX.get(mark.x);
    if (!byY) {
      byY = new Map<number, HopMark>();
      hopByX.set(mark.x, byY);
    }
    const existing = byY.get(mark.y);
    if (!existing) hopCount++;
    if (!existing || mark.halfWidth > existing.halfWidth) byY.set(mark.y, mark);
  };
  // Round away 1e-14 float noise from the intersection maths so marks are stable
  // and, for clean axis-aligned inputs, byte-identical to the pre-#1939 values.
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  for (const [host, crossings] of crossingsPerHost) {
    crossings.sort((a, b) => a.coord - b.coord);
    const angle = round((Math.atan2(host.uy, host.ux) * 180) / Math.PI);
    let lo = 0;
    const flush = (hi: number) => {
      const pMin = crossings[lo].point;
      const pMax = crossings[hi].point;
      addHop({
        x: round((pMin.x + pMax.x) / 2),
        y: round((pMin.y + pMax.y) / 2),
        halfWidth: round(Math.hypot(pMax.x - pMin.x, pMax.y - pMin.y) / 2 + HOP_RADIUS),
        angle,
        edge: host.edge,
      });
    };
    for (let k = 1; k < crossings.length; k++) {
      if (crossings[k].coord - crossings[k - 1].coord > HOP_CLUSTER_GAP) {
        flush(k - 1);
        lo = k;
      }
    }
    flush(crossings.length - 1);
  }
  // Collection order is irrelevant: the sort below is a total order on the
  // distinct (x, y) keys.
  const hops: HopMark[] = new Array(hopCount);
  let h = 0;
  for (const byY of hopByX.values()) for (const mark of byY.values()) hops[h++] = mark;

  // Junction dots: a dot belongs only where the shared spine actually *continues
  // past* the elbow — a T/＋ where another stub joins above (circuit convention).
  // The topmost stub of each trunk is just the spine head, an L-corner, and gets
  // no dot. (`waypoints[0]` for every trunked edge is a right-angle elbow, so
  // dotting them all would put ● on plain corners.)
  const junctionSeen = new Set<string>();
  const junctions: JunctionMark[] = [];
  const trunks: TrunkGroup[] = [];
  for (const group of trunkElbows.values()) {
    const { x, entries, endY } = group;
    trunks.push(group);
    const minY = Math.min(...entries.map((e) => e.y));
    const headCount = entries.filter((e) => Math.abs(e.y - minY) < EPS).length;
    const towardEnd = endY > minY ? EPS * 10 : -EPS * 10;
    for (const { y, edge } of entries) {
      // A merge if the spine extends above this elbow (some stub joins higher),
      // or two stubs meet at the head itself (still a T, not a lone corner).
      const isMerge = y > minY + EPS || (Math.abs(y - minY) < EPS && headCount >= 2);
      if (!isMerge) continue;
      const key = `${x},${y}`;
      if (junctionSeen.has(key)) continue;
      junctionSeen.add(key);
      // What the spine carries *onward* from here, which is what a reader wants
      // at a merge and what the band below is drawn as.
      junctions.push({ x, y, edge, count: carriedAt(group, y + towardEnd).length });
    }
  }

  // Ordered here so detection is deterministic on its own, which is what the
  // prefilter parity test compares.
  hops.sort((a, b) => a.y - b.y || a.x - b.x);
  junctions.sort((a, b) => a.y - b.y || a.x - b.x);
  return { hops, junctions, trunks };
}

/**
 * The siblings a trunk's spine carries at height `y`. Each sibling occupies the
 * spine between its own elbow and the shared end, whichever way round the spine
 * runs, so the count is just how many of those stretches contain `y`.
 */
function carriedAt(trunk: TrunkGroup, y: number): { edge: number }[] {
  return trunk.entries
    .map((e) => ({ lo: Math.min(e.y, trunk.endY), hi: Math.max(e.y, trunk.endY), edge: e.edge }))
    .filter((sp) => sp.lo < y && y < sp.hi);
}

/**
 * The bands: one per stretch the count is constant over. The stretch against the
 * shared end always carries every sibling, so it and the run into the target
 * come out as one polyline, which makes their corner a join.
 */
function bandsOf(trunks: readonly TrunkGroup[]): TrunkBand[] {
  const bands: TrunkBand[] = [];
  for (const trunk of trunks) {
    const { x, entries, endY, entryX } = trunk;
    const minY = Math.min(...entries.map((e) => e.y));
    const cuts = [
      ...new Set(entries.flatMap((e) => [Math.min(e.y, endY), Math.max(e.y, endY)])),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const y0 = cuts[i];
      const y1 = cuts[i + 1];
      if (y1 - y0 < EPS) continue;
      const carried = carriedAt(trunk, (y0 + y1) / 2);
      if (carried.length < 2) continue;
      // Run the band the way the edges travel, so the stretch that ends at the
      // spine's far end can carry on into the target.
      const from = endY > minY ? { x, y: y0 } : { x, y: y1 };
      const to = endY > minY ? { x, y: y1 } : { x, y: y0 };
      const atEnd = Math.abs(to.y - endY) < EPS;
      const points =
        atEnd && Math.abs(entryX - x) > EPS ? [from, to, { x: entryX, y: endY }] : [from, to];
      bands.push({ points, count: carried.length, edge: carried[0].edge });
    }
  }
  return bands;
}

/**
 * Keep both marks readable over a band. A hop has to arch clear of what it
 * crosses, and the band is as wide as the count it carries while the arc rises
 * {@link HOP_RADIUS}, so an unadjusted arc is drawn inside the thing it marks a
 * crossing over once the count is high enough.
 * A count mark must not sit on a crossing either: it would hide the arc under a
 * mark that asserts the opposite. The count moves, never the crossing
 * (TPL-2631).
 */
function clearMarksOfBands(
  hops: HopMark[],
  junctions: JunctionMark[],
  bands: readonly TrunkBand[],
  trunks: readonly TrunkGroup[],
): void {
  if (bands.length > 0) {
    for (const hop of hops) {
      let clearance = 0;
      for (const band of bands) {
        const half = trunkBandHalfWidth(band.count);
        if (half <= clearance) continue;
        if (onBand(hop, band, half)) clearance = half;
      }
      if (clearance === 0) continue;
      // Wide enough that the arc's feet land outside the band, tall enough that
      // its crown rises out of it.
      hop.halfWidth = Math.max(hop.halfWidth, clearance + BAND_CLEARANCE);
      hop.ry = Math.max(HOP_RADIUS, clearance + BAND_CLEARANCE);
    }
  }
  for (const mark of junctions) {
    slideOffCrossings(mark, hops, junctions, spineOf(mark, trunks));
  }
}

/**
 * Move a count mark off any crossing it covers, along the spine it belongs to.
 *
 * A search rather than a walk: stepping one offset at a time and re-deciding
 * from there oscillates, because the direction "away from the crossing" flips
 * once the mark passes it. Here every reachable spot is proposed at once,
 * nearest first and away from the crossing before towards it, and the first
 * good one is taken.
 *
 * Good means clear of the crossing *and* of every other count mark. Where no
 * spot is clear of both, being off the crossing wins: a chip on a crossing says
 * the crossing is a connection, while two chips on each other only hide a
 * number. Where nothing is clear at all, the mark stays where the merge is.
 */
function slideOffCrossings(
  mark: JunctionMark,
  hops: readonly HopMark[],
  junctions: readonly JunctionMark[],
  spine: { lo: number; hi: number } | undefined,
): void {
  const covered = (y: number) => hops.some((hop) => covers({ ...mark, y }, hop));
  if (!covered(mark.y)) return;
  const base = mark.y;
  const onSpine = (y: number) => (spine ? Math.min(Math.max(y, spine.lo), spine.hi) : y);
  // Away from the nearest crossing first, so the mark moves the way a reader
  // would expect, and nearest first so it stays as close to the merge as it can.
  const clash = hops.find((hop) => covers(mark, hop))!;
  const dirs = clash.y >= base ? [-1, 1] : [1, -1];
  const candidates: number[] = [];
  for (let step = 1; step <= JUNCTION_SLIDE_STEPS; step++) {
    for (const dir of dirs) {
      const y = onSpine(base + dir * step * JUNCTION_SLIDE);
      if (Math.abs(y - base) > EPS && !candidates.some((c) => Math.abs(c - y) < EPS)) {
        candidates.push(y);
      }
    }
  }
  const free = candidates.filter((y) => !covered(y));
  const best = free.find((y) => clearOfChips(mark, y, junctions)) ?? free[0];
  if (best !== undefined) mark.y = best;
}

/** Whether `y` keeps `mark` a chip's width clear of every other count mark. */
function clearOfChips(mark: JunctionMark, y: number, junctions: readonly JunctionMark[]): boolean {
  return junctions.every(
    (other) =>
      other === mark ||
      Math.abs(other.x - mark.x) >= JUNCTION_CHIP_RADIUS * 2 ||
      Math.abs(other.y - y) >= JUNCTION_CHIP_RADIUS * 2,
  );
}

/** The stretch of spine a count mark may slide along: its trunk's own extent. */
function spineOf(
  mark: JunctionMark,
  trunks: readonly TrunkGroup[],
): { lo: number; hi: number } | undefined {
  for (const trunk of trunks) {
    if (Math.abs(trunk.x - mark.x) > EPS) continue;
    // The mark was made from one of this trunk's entries, so ownership is exact.
    // Matching on the spine's x and a containing y instead would hand a mark the
    // extent of a *different* trunk wherever two share a lane and overlap, and
    // clamp it to a stretch it does not belong to.
    // The mark was made from one of this trunk's entries, so ownership is exact.
    // Matching on the spine's x and a containing y instead would hand a mark the
    // extent of a *different* trunk wherever two share a lane and overlap, and
    // clamp it to a stretch it does not belong to.
    if (!trunk.entries.some((e) => e.edge === mark.edge)) continue;
    const lo = Math.min(...trunk.entries.map((e) => e.y), trunk.endY);
    const hi = Math.max(...trunk.entries.map((e) => e.y), trunk.endY);
    return { lo, hi };
  }
  return undefined;
}

/** Whether `hop` lies on `band`, which is `half` px wide either side. */
function onBand(hop: HopMark, band: TrunkBand, half: number): boolean {
  for (let i = 0; i < band.points.length - 1; i++) {
    const a = band.points[i];
    const b = band.points[i + 1];
    const vertical = Math.abs(a.x - b.x) < EPS;
    const on = vertical
      ? Math.abs(hop.x - a.x) <= half + 2 &&
        hop.y > Math.min(a.y, b.y) - EPS &&
        hop.y < Math.max(a.y, b.y) + EPS
      : Math.abs(hop.y - a.y) <= half + 2 &&
        hop.x > Math.min(a.x, b.x) - EPS &&
        hop.x < Math.max(a.x, b.x) + EPS;
    if (on) return true;
  }
  return false;
}

/** How far a count mark slides along the spine to get off a crossing, and how far it may go. */
const JUNCTION_SLIDE = JUNCTION_CHIP_RADIUS + 10;
const JUNCTION_SLIDE_STEPS = 8;

/** Whether the count mark drawn at `mark` would cover `hop`'s arc. */
function covers(mark: JunctionMark, hop: HopMark): boolean {
  return (
    Math.abs(hop.x - mark.x) < JUNCTION_CHIP_RADIUS + hop.halfWidth &&
    Math.abs(hop.y - mark.y) < JUNCTION_CHIP_RADIUS + (hop.ry ?? HOP_RADIUS) + 2
  );
}
