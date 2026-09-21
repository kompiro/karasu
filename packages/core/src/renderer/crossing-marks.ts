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
  TrunkSpineMark,
  TrunkCountMark,
  CrossingMarks,
  HopMark,
  JunctionMark,
  LayoutEdge,
} from "./layout-types.js";
import type { Point } from "./edge-geometry.js";
import { BoxGrid, chooseCellSize } from "./spatial-grid.js";

/**
 * SPIKE ONLY (#2631 slice E). `packages/core` is typechecked by browser-targeted
 * packages too (i18n, nest), where `process` has no type, so the spike's
 * switches read it off `globalThis`. The real implementation must not read the
 * environment from core at all.
 */
function spikeEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

/** Radius of a single hop arc's bump (px). */
export const HOP_RADIUS = 4;
/**
 * SPIKE ONLY (#2631 slice E). The arc radius to draw with. `KARASU_HOP_RADIUS`
 * raises it so a crossing reads at the same size as a trunk count tip (r = 9)
 * instead of the 4px bump it has been since #1859. It feeds the clustering gap
 * too, so widening the arc also widens what counts as one cluster.
 */
function hopRadius(): number {
  const v = Number(spikeEnv("KARASU_HOP_RADIUS"));
  return Number.isFinite(v) && v > 0 ? v : HOP_RADIUS;
}
/**
 * Crossings on the same host segment closer than this (in px along the segment)
 * merge into one wide hop (design doc: `HOP_CLUSTER_GAP`, hop-radius-derived).
 * Coordinate-derived so the mark set stays deterministic.
 */
export const HOP_CLUSTER_GAP = HOP_RADIUS * 2;
/** SPIKE ONLY (#2631): the clustering gap for the spiked radius. */
function hopClusterGap(): number {
  return hopRadius() * 2;
}
/** Radius of a junction connection dot (px). */
export const JUNCTION_RADIUS = 2.5;

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
  const segs: Seg[] = [];
  // Trunk stub-join elbows grouped by spine (`trunkId` @ spine x). Each edge's
  // `waypoints[0]` is where its stub joins the shared vertical spine; `edge` is
  // that stub's index so its junction dot can be coloured like the edge.
  const trunkElbows = new Map<
    string,
    { x: number; entries: { y: number; edge: number }[]; endY: number; entryX: number }
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

    // SPIKE (#2631): the mirror shape. An out-trunk's siblings share the *first*
    // corner (they leave the source together) and branch at the last one, so the
    // roles of the two elbows are swapped.
    if (edge.outTrunkId !== undefined && edge.waypoints && edge.waypoints.length > 1) {
      const branch = edge.waypoints[edge.waypoints.length - 1];
      const key = `out:${edge.outTrunkId}@${branch.x}`;
      const endY = edge.waypoints[0].y;
      const entryX = edge.fromPoint.x;
      const group = trunkElbows.get(key);
      if (group) group.entries.push({ y: branch.y, edge: edgeIdx });
      else
        trunkElbows.set(key, {
          x: branch.x,
          entries: [{ y: branch.y, edge: edgeIdx }],
          endY,
          entryX,
        });
    }

    // Junction candidate: the elbow where a trunked edge's stub joins the spine.
    if (edge.trunkId !== undefined && edge.waypoints && edge.waypoints.length > 0) {
      const elbow = edge.waypoints[0];
      const key = `${edge.trunkId}@${elbow.x}`;
      // SPIKE (#2631): the spine's far end — the elbow just before the target
      // entry — is the same point for every sibling of one trunk.
      const endY = edge.waypoints[edge.waypoints.length - 1].y;
      const entryX = edge.toPoint.x;
      const group = trunkElbows.get(key);
      if (group) group.entries.push({ y: elbow.y, edge: edgeIdx });
      else
        trunkElbows.set(key, {
          x: elbow.x,
          entries: [{ y: elbow.y, edge: edgeIdx }],
          endY,
          entryX,
        });
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
        halfWidth: round(Math.hypot(pMax.x - pMin.x, pMax.y - pMin.y) / 2 + hopRadius()),
        angle,
        edge: host.edge,
      });
    };
    for (let k = 1; k < crossings.length; k++) {
      if (crossings[k].coord - crossings[k - 1].coord > hopClusterGap()) {
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
  for (const { x, entries } of trunkElbows.values()) {
    const minY = Math.min(...entries.map((e) => e.y));
    const headCount = entries.filter((e) => Math.abs(e.y - minY) < EPS).length;
    for (const { y, edge } of entries) {
      // A merge if the spine extends above this elbow (some stub joins higher),
      // or two stubs meet at the head itself (still a T, not a lone corner).
      const isMerge = y > minY + EPS || (Math.abs(y - minY) < EPS && headCount >= 2);
      if (!isMerge) continue;
      const key = `${x},${y}`;
      if (junctionSeen.has(key)) continue;
      junctionSeen.add(key);
      // SPIKE (#2631): in the tip modes the count chip stands where the dot
      // would — one mark per merge, not two.
      const lg = trunkLegibility();
      if (lg === "tip" || lg === "tiponly" || lg === "tipentry") continue;
      junctions.push({ x, y, edge });
    }
  }

  // SPIKE ONLY (#2631 slice E): how many siblings the spine carries at each
  // height, so the renderer can widen it where it is a bundle and say "× N"
  // where it enters the target. A dot says a merge happened; neither of these
  // is derivable from the dot alone, which is what the slice is about.
  const trunkSpines: TrunkSpineMark[] = [];
  const trunkCounts: TrunkCountMark[] = [];
  const mode = trunkLegibility();
  if (mode !== "off") {
    for (const { x, entries, endY, entryX } of trunkElbows.values()) {
      if (entries.length < 2) continue;
      // Each sibling occupies the spine between its own elbow and the shared
      // end, whichever way the spine runs.
      const spans = entries.map((e) => ({
        lo: Math.min(e.y, endY),
        hi: Math.max(e.y, endY),
        edge: e.edge,
      }));
      const carriedAt = (y: number): { edge: number }[] =>
        spans.filter((sp) => sp.lo < y && y < sp.hi);
      const cuts = [...new Set(spans.flatMap((sp) => [sp.lo, sp.hi]))].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const y0 = cuts[i];
        const y1 = cuts[i + 1];
        if (y1 - y0 < EPS) continue;
        const carried = carriedAt((y0 + y1) / 2);
        if (carried.length < 2) continue;
        trunkSpines.push({ x0: x, y0, x1: x, y1, count: carried.length, edge: carried[0].edge });
      }
      // The run into the target carries every sibling, so it is the widest part
      // of the bundle — not the thin line it is drawn as today.
      if (Math.abs(entryX - x) > EPS) {
        trunkSpines.push({
          x0: x,
          y0: endY,
          x1: entryX,
          y1: endY,
          count: entries.length,
          edge: entries[0].edge,
        });
      }
      if (mode === "tip" || mode === "tiponly" || mode === "tipentry" || mode === "tipside") {
        // One chip per merge, standing where the junction dot would: the number
        // is how many the spine carries onward from that elbow.
        const seen = new Set<number>();
        for (const { y, edge } of entries) {
          if (seen.has(y)) continue;
          seen.add(y);
          const onward = carriedAt(y + (endY > y ? EPS * 10 : -EPS * 10)).length;
          if (onward < 2) continue;
          // `tipside` keeps the junction dot on the spine and sets the number
          // beside it, so neither mark can ever cover a hop arc.
          const bandHalfHere = (1 + Math.min(onward - 1, 8) * 3) / 2;
          const dx = mode === "tipside" ? bandHalfHere + 12 : 0;
          trunkCounts.push({ x: x + dx, y, count: onward, edge });
        }
        if (mode === "tipentry") {
          trunkCounts.push({
            x: (x + entryX) / 2,
            y: endY,
            count: entries.length,
            edge: entries[0].edge,
          });
        }
      } else if (mode === "count") {
        trunkCounts.push({ x, y: endY, count: entries.length, edge: entries[0].edge });
      }
    }
  }

  // SPIKE ONLY (#2631 slice E). A hop has to arch *clear of what it crosses*.
  // The band is up to 25px wide, while the default arc rises 4px, so without
  // this a crossing over a busy trunk is drawn inside the band and reads as a
  // connection — the exact misreading hops exist to prevent (ADR-1859).
  // Only where the band is actually drawn: `label` / `count` leave the spine at
  // its normal width, so their hops must stay the default size.
  const bandDrawn = mode === "bus" || mode === "tip" || mode === "tipentry" || mode === "tipside";
  // `KARASU_TRUNK_HOPFIX=0` leaves the arcs at their default size, so the report
  // can show what the band does to an unadjusted hop.
  if (trunkSpines.length > 0 && bandDrawn && spikeEnv("KARASU_TRUNK_HOPFIX") !== "0") {
    const bandHalf = (count: number): number => (1 + Math.min(count - 1, 8) * 3) / 2;
    for (const hop of hops) {
      let clearance = 0;
      for (const sp of trunkSpines) {
        const vertical = Math.abs(sp.x1 - sp.x0) < EPS;
        const half = bandHalf(sp.count);
        const on = vertical
          ? Math.abs(hop.x - sp.x0) <= half + 2 &&
            hop.y > Math.min(sp.y0, sp.y1) - EPS &&
            hop.y < Math.max(sp.y0, sp.y1) + EPS
          : Math.abs(hop.y - sp.y0) <= half + 2 &&
            hop.x > Math.min(sp.x0, sp.x1) - EPS &&
            hop.x < Math.max(sp.x0, sp.x1) + EPS;
        if (on && half > clearance) clearance = half;
      }
      if (clearance === 0) continue;
      // Wide enough that the arc's feet land outside the band, tall enough that
      // its crown rises out of it.
      hop.halfWidth = Math.max(hop.halfWidth, clearance + 3);
      hop.ry = Math.max(hopRadius(), clearance + 3);
    }
  }

  // SPIKE ONLY (#2631 slice E). A count tip must not sit on a crossing: it
  // would hide the hop arc under a "merge = connected" mark. Slide it along the
  // spine to the first clear spot.
  if (trunkCounts.length > 0 && hops.length > 0 && mode !== "tipside") {
    const TIP_R = 11;
    const clashes = (tip: TrunkCountMark, mark: HopMark): boolean =>
      Math.abs(mark.x - tip.x) < TIP_R + mark.halfWidth &&
      Math.abs(mark.y - tip.y) < TIP_R + (mark.ry ?? hopRadius()) + 2;
    for (const tip of trunkCounts) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const clash = hops.find((mark) => clashes(tip, mark));
        if (!clash) break;
        tip.y += clash.y >= tip.y ? -(TIP_R + 10) : TIP_R + 10;
      }
    }
  }

  // Stable order → deterministic SVG output.
  hops.sort((a, b) => a.y - b.y || a.x - b.x);
  junctions.sort((a, b) => a.y - b.y || a.x - b.x);
  trunkSpines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  trunkCounts.sort((a, b) => a.y - b.y || a.x - b.x);

  // Omit the spike's fields when empty, so the default path returns exactly the
  // object shape it always did (two reference tests compare the whole object).
  // SPIKE (#2631): carry the spiked radius to the renderer, which otherwise
  // falls back to the HOP_RADIUS constant.
  if (hopRadius() !== HOP_RADIUS) for (const hop of hops) hop.ry ??= hopRadius();
  if (trunkSpines.length === 0 && trunkCounts.length === 0) return { hops, junctions };
  return { hops, junctions, trunkSpines, trunkCounts };
}

/**
 * SPIKE ONLY (#2631 slice E). Which legibility affordances to draw on top of
 * today's trunk: `off` (today), `label` (each trunked edge's label moves onto
 * its own stub), `bus` (label + a spine whose width says how many it carries),
 * `count` (label + a "× N" chip at the target entry).
 */
export type TrunkLegibility =
  | "off"
  | "label"
  | "bus"
  | "count"
  | "tip"
  | "tiponly"
  | "tipentry"
  | "tipside";
export function trunkLegibility(): TrunkLegibility {
  const v = spikeEnv("KARASU_TRUNK_LEGIBILITY");
  return v === "label" ||
    v === "bus" ||
    v === "count" ||
    v === "tip" ||
    v === "tiponly" ||
    v === "tipentry" ||
    v === "tipside"
    ? v
    : "off";
}
