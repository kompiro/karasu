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
 *   - **junction (●)**: the elbow where a trunked edge's horizontal stub joins
 *     the shared spine (`waypoints[0]`) gets a connection dot — "merge = connected".
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
  const junctions: JunctionMark[] = [];

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

    // Junction: the elbow where a trunked edge's stub joins the shared spine.
    if (edge.trunkId !== undefined && edge.waypoints && edge.waypoints.length > 0) {
      junctions.push({ x: edge.waypoints[0].x, y: edge.waypoints[0].y });
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

  // Cluster crossings on the same horizontal line into one wide hop.
  const hops: HopMark[] = [];
  for (const [h, xs] of crossingXsPerH) {
    xs.sort((a, b) => a - b);
    let clusterMin = xs[0];
    let clusterMax = xs[0];
    const flush = () => {
      hops.push({
        x: (clusterMin + clusterMax) / 2,
        y: h.y,
        halfWidth: (clusterMax - clusterMin) / 2 + HOP_RADIUS,
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

  // Dedup junctions by coordinate (siblings on one spine differ in y, so all
  // survive; identical points collapse).
  const seen = new Set<string>();
  const uniqueJunctions: JunctionMark[] = [];
  for (const j of junctions) {
    const key = `${j.x},${j.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueJunctions.push(j);
  }

  // Stable order → deterministic SVG output.
  hops.sort((a, b) => a.y - b.y || a.x - b.x);
  uniqueJunctions.sort((a, b) => a.y - b.y || a.x - b.x);

  return { hops, junctions: uniqueJunctions };
}
