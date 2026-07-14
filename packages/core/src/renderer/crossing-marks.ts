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

import type { CrossingMarks, HopMark, JunctionMark, LayoutEdge } from "./layout-types.js";
import type { Point } from "./edge-geometry.js";

/** Radius of a single hop arc's bump (px). */
export const HOP_RADIUS = 4;
/**
 * Crossings on the same host segment closer than this (in px along the segment)
 * merge into one wide hop (design doc: `HOP_CLUSTER_GAP`, hop-radius-derived).
 * Coordinate-derived so the mark set stays deterministic.
 */
export const HOP_CLUSTER_GAP = HOP_RADIUS * 2;
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
  const len1 = Math.hypot(rx, ry);
  const len2 = Math.hypot(sx, sy);
  // Distance from the crossing to each endpoint = t·len / (1−t)·len etc. A
  // negative value (out-of-segment) is also ≤ EPS, so this rejects both
  // endpoint-touches and off-segment intersections in one test.
  if (t * len1 <= EPS || (1 - t) * len1 <= EPS || u * len2 <= EPS || (1 - u) * len2 <= EPS) {
    return null;
  }
  return { x: s1.a.x + t * rx, y: s1.a.y + t * ry };
}

/**
 * Derive hop and junction marks from the final grouped edge geometry. Only the
 * Group-by layout calls this (ungrouped never sets `LayoutResult.crossingMarks`,
 * so the ungrouped SVG stays byte-identical — AC-5).
 */
export function computeCrossingMarks(edges: LayoutEdge[]): CrossingMarks {
  const segs: Seg[] = [];
  // Trunk stub-join elbows grouped by spine (`trunkId` @ spine x). Each edge's
  // `waypoints[0]` is where its stub joins the shared vertical spine; `edge` is
  // that stub's index so its junction dot can be coloured like the edge.
  const trunkElbows = new Map<string, { x: number; entries: { y: number; edge: number }[] }>();

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
      segs.push({ a, b, edge: edgeIdx, ux, uy });
    }

    // Junction candidate: the elbow where a trunked edge's stub joins the spine.
    if (edge.trunkId !== undefined && edge.waypoints && edge.waypoints.length > 0) {
      const elbow = edge.waypoints[0];
      const key = `${edge.trunkId}@${elbow.x}`;
      const group = trunkElbows.get(key);
      if (group) group.entries.push({ y: elbow.y, edge: edgeIdx });
      else trunkElbows.set(key, { x: elbow.x, entries: [{ y: elbow.y, edge: edgeIdx }] });
    }
  });

  // Assign each strict-interior crossing to the **more horizontal** of the two
  // segments (larger |ux|; tie → smaller edge index, then segment order), so the
  // arc rides the flatter line and steep spines stay clean. `coord` is the
  // crossing's 1-D position along the host's canonical direction, for clustering.
  const crossingsPerHost = new Map<Seg, { coord: number; point: Point }[]>();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      if (s1.edge === s2.edge) continue;
      // Cheap AABB reject before the intersection maths: segments whose bounding
      // boxes don't overlap can't cross. Prunes most of the O(n²) pairs.
      if (
        Math.min(s1.a.x, s1.b.x) > Math.max(s2.a.x, s2.b.x) ||
        Math.max(s1.a.x, s1.b.x) < Math.min(s2.a.x, s2.b.x) ||
        Math.min(s1.a.y, s1.b.y) > Math.max(s2.a.y, s2.b.y) ||
        Math.max(s1.a.y, s1.b.y) < Math.min(s2.a.y, s2.b.y)
      ) {
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
  const hopByKey = new Map<string, HopMark>();
  const addHop = (mark: HopMark) => {
    const key = `${mark.x},${mark.y}`;
    const existing = hopByKey.get(key);
    if (!existing || mark.halfWidth > existing.halfWidth) hopByKey.set(key, mark);
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
  const hops = [...hopByKey.values()];

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
      junctions.push({ x, y, edge });
    }
  }

  // Stable order → deterministic SVG output.
  hops.sort((a, b) => a.y - b.y || a.x - b.x);
  junctions.sort((a, b) => a.y - b.y || a.x - b.x);

  return { hops, junctions };
}
