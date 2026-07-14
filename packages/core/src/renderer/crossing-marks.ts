/**
 * Crossing marks for the Group-by system view (#1859 P2c-C).
 *
 * After the grouped router (`routeGroupedEdges` / `aggregateGroupTrunks`) makes
 * every edge segment axis-aligned, `computeCrossingMarks` derives two marks that
 * disambiguate line meetings *by representation* (the circuit-diagram
 * convention), so a crossing can never be misread as a connection:
 *
 *   - **hop (◠)**: a horizontal segment that crosses a vertical segment of a
 *     *different* edge at a right angle arcs *over* it — "crossing, NOT
 *     connected". The vertical (gutter corridor / trunk spine — the high-traffic
 *     through-line) stays a clean straight line; the horizontal stub bumps over.
 *   - **junction (●)**: a trunk stub-join elbow (`waypoints[0]`) gets a connection
 *     dot — "merge = connected" — but only where the spine continues past it (a
 *     T/＋). The topmost stub of a trunk is the spine head, a plain L-corner, and
 *     gets no dot (circuit convention: dots mark connections, not bends).
 *
 * Crossings are detected with the same **strict-interior** test the routers use
 * (`edge-geometry.ts`, `1e-6` epsilon) so a stub *ending* on a spine (a trunk
 * join) or an edge's own corner — both endpoints, not interior — is correctly
 * NOT a hop. Marks are derived from final coordinates only, so they are
 * deterministic and snapshot-stable.
 *
 * See docs/design/system-view-grouping.md § "P2c-C 詳細設計".
 */

import type { CrossingMarks, HopMark, JunctionMark, LayoutEdge } from "./layout-types.js";
import type { Point } from "./edge-geometry.js";

/** Radius of a single hop arc's bump (px). */
export const HOP_RADIUS = 4;
/**
 * Crossings on the same horizontal line whose x positions are within this gap
 * merge into one wide hop (design doc: `HOP_CLUSTER_GAP`, hop-radius-derived).
 * Coordinate-derived so the mark set stays deterministic.
 */
export const HOP_CLUSTER_GAP = HOP_RADIUS * 2;
/** Radius of a junction connection dot (px). */
export const JUNCTION_RADIUS = 2.5;

const EPS = 1e-6;

interface HSeg {
  x0: number;
  x1: number;
  y: number;
  edge: number;
}

interface VSeg {
  y0: number;
  y1: number;
  x: number;
  edge: number;
}

/**
 * Derive hop and junction marks from the final grouped edge geometry. Only the
 * Group-by layout calls this (ungrouped never sets `LayoutResult.crossingMarks`,
 * so the ungrouped SVG stays byte-identical — AC-5).
 */
export function computeCrossingMarks(edges: LayoutEdge[]): CrossingMarks {
  const hSegs: HSeg[] = [];
  const vSegs: VSeg[] = [];
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
      const horizontal = Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS;
      const vertical = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS;
      if (horizontal) {
        hSegs.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y: a.y, edge: edgeIdx });
      } else if (vertical) {
        vSegs.push({ y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), x: a.x, edge: edgeIdx });
      }
      // Diagonal / zero-length segments carry no right-angle crossing; skip.
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

  // Collect strict-interior crossing xs per horizontal segment. A crossing needs
  // the vertical's x strictly inside the horizontal's span AND the horizontal's y
  // strictly inside the vertical's span — so shared endpoints (trunk joins,
  // corners) do not count.
  const crossingXsPerH = new Map<HSeg, number[]>();
  for (const h of hSegs) {
    for (const v of vSegs) {
      if (h.edge === v.edge) continue;
      const xInterior = v.x > h.x0 + EPS && v.x < h.x1 - EPS;
      const yInterior = h.y > v.y0 + EPS && h.y < v.y1 - EPS;
      if (xInterior && yInterior) {
        const list = crossingXsPerH.get(h);
        if (list) list.push(v.x);
        else crossingXsPerH.set(h, [v.x]);
      }
    }
  }

  // Cluster crossings on the same horizontal line into one wide hop. Distinct
  // horizontal segments can be collinear (same y, different edges) and cross the
  // same vertical, so dedup identical arcs, keeping the widest at each point.
  const hopByPoint = new Map<string, HopMark>();
  const addHop = (mark: HopMark) => {
    const key = `${mark.x},${mark.y}`;
    const existing = hopByPoint.get(key);
    if (!existing || mark.halfWidth > existing.halfWidth) hopByPoint.set(key, mark);
  };
  for (const [h, xs] of crossingXsPerH) {
    xs.sort((a, b) => a - b);
    let clusterMin = xs[0];
    let clusterMax = xs[0];
    const flush = () => {
      addHop({
        x: (clusterMin + clusterMax) / 2,
        y: h.y,
        halfWidth: (clusterMax - clusterMin) / 2 + HOP_RADIUS,
        edge: h.edge,
      });
    };
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - clusterMax <= HOP_CLUSTER_GAP) {
        clusterMax = xs[i];
      } else {
        flush();
        clusterMin = xs[i];
        clusterMax = xs[i];
      }
    }
    flush();
  }
  const hops = [...hopByPoint.values()];

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
