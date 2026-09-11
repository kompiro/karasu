/**
 * Spatial index over the routing chain's obstacles (#2790, #2757 slice E).
 *
 * Every pass in `runRoutingChain` tests candidate routes against the same
 * obstacle set: **every node card except the edge's two endpoints, plus the
 * pieces of every group frame that encloses neither endpoint** (#2179). Each
 * pass used to rebuild that set as a fresh `Rect[]` per edge, and each
 * candidate segment then walked the whole array, so the cost of routing one
 * edge scaled with the size of the canvas rather than with the length of the
 * route. This module builds the set once per routing pass and answers "does
 * this segment cross anything?" from a uniform grid, applying the per-endpoint
 * exemption **at query time** so that one index serves every edge.
 *
 * Two properties make the substitution exact, so no route changes:
 *
 * - The grid (`BoxGrid`, #2760) is a **prefilter only**: a query returns a
 *   superset of the obstacles whose closed bounds meet the query box, and the
 *   exact `segmentCrossesRect` clip still decides. A rect the clip would have
 *   rejected the route for meets the segment's bounding box, so it shares a
 *   cell with it and the prefilter can never drop it.
 * - Every consumer asks a **boolean** question (does this segment, or any
 *   segment of this polyline, cross an obstacle?), so the order in which
 *   obstacles are examined is not observable. Nothing downstream reads the
 *   obstacle list itself.
 *
 * Each indexed entry remembers where it came from: a node card its node id, a
 * frame piece the id of the frame `framePieces` decomposed. That owner is what
 * the exemption is keyed on, which is why the index can apply it per query
 * instead of materialising a different array per edge.
 *
 * The prefilter is the whole of the gain. A spike that built the obstacle set
 * once but still scanned it linearly measured the same as rebuilding it per
 * edge; the 1.7M rect allocations the flat path made cost essentially nothing.
 */
import type { ContainerRect, LayoutNode } from "./layout-types.js";
import { type Point, type Rect, segmentCrossesRect } from "./edge-geometry.js";
import { buildFramesOfNode, framePieces } from "./frame-geometry.js";
import { BoxGrid, chooseCellSize } from "./spatial-grid.js";

/**
 * The obstacle set as one edge sees it. Both routers, the trunk pass and the
 * outline-seating pass take one of these where they used to take a `Rect[]`.
 */
export interface ObstacleQuery {
  /** True if the segment (a, b) crosses the interior of any non-exempt obstacle. */
  segmentCrosses(a: Point, b: Point): boolean;
  /** True if no segment of the polyline crosses any non-exempt obstacle. */
  polylineClear(path: readonly Point[]): boolean;
}

/**
 * Every node card and every group-frame piece on the canvas, in one grid, with
 * the per-endpoint exemption applied when an edge asks.
 *
 * Lifetime: one index per `runRoutingChain` invocation. Nodes and frames do not
 * move while the chain runs (only ports and waypoints do), so all five passes
 * share one; a re-placement such as the width-budget search calls the chain
 * again and builds a new one.
 */
/** Both coordinates are finite, so the grid can place the point in a cell. */
function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export class ObstacleIndex {
  /** The obstacle rects themselves, in insertion order: cards first, then frame pieces. */
  private readonly rects: Rect[] = [];
  /** Per entry: the node id (a card) or the frame id (a frame piece) it belongs to. */
  private readonly owner: string[] = [];
  /** Per entry: true for a frame piece, false for a node card. */
  private readonly isFramePiece: boolean[] = [];
  /** Frame ids per node id, the exemption map every query is keyed on. */
  private readonly framesOfNode: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly grid: BoxGrid;
  /**
   * Scratch for `BoxGrid.query`, reused across queries. Safe because a query
   * fills it and consumes it before returning, and `segmentCrossesRect` cannot
   * re-enter the index, so two queries never interleave over it.
   */
  private readonly candidates: number[] = [];

  private constructor(
    nodes: readonly LayoutNode[],
    frames: readonly ContainerRect[],
    expandedFrames: ReadonlyMap<string, ContainerRect> | undefined,
  ) {
    this.framesOfNode = buildFramesOfNode(nodes, frames, expandedFrames);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (r: Rect, owner: string, framePiece: boolean): void => {
      this.rects.push(r);
      this.owner.push(owner);
      this.isFramePiece.push(framePiece);
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    };
    for (const n of nodes) add(n, n.id, false);
    for (const f of frames) for (const p of framePieces(f)) add(p, f.id, true);

    // An empty canvas still gets a grid, so the query path has no second shape.
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }
    const sizes = new Float64Array(this.rects.length);
    for (let i = 0; i < this.rects.length; i++) {
      sizes[i] = Math.max(this.rects[i].width, this.rects[i].height);
    }
    this.grid = new BoxGrid(
      chooseCellSize(sizes, maxX - minX, maxY - minY),
      minX,
      minY,
      maxX,
      maxY,
    );
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      this.grid.insert(i, r.x, r.y, r.x + r.width, r.y + r.height);
    }
  }

  /**
   * Index the whole canvas: every card and every frame piece, whatever route
   * shape will later be tested against it. The input is deliberately not
   * filtered by route shape or by pass — an index built from a subset would
   * make the obstacle set depend on which candidate is being tried, which is
   * the class of drift TPL-1954 exists to catch.
   *
   * `expandedFrames` is passed through to the exemption map so an in-place
   * expanded container's own boundary frame is exempt for its own edges, as
   * `resolveGroupBoxes` arranged before.
   */
  static build(
    nodes: readonly LayoutNode[],
    frames: readonly ContainerRect[],
    expandedFrames?: ReadonlyMap<string, ContainerRect>,
  ): ObstacleIndex {
    return new ObstacleIndex(nodes, frames, expandedFrames);
  }

  /**
   * The obstacle set as the edge from `from` to `to` sees it.
   *
   * The exemption is two map lookups rather than a filtered copy of the canvas:
   * the edge's two endpoint ids, and the frames enclosing either of them. The
   * skip predicate is the one the flat `obstaclesFor` filtered with, so the
   * #2179 boundary-overlap semantics are unchanged: an edge between two members
   * of one boundary is exempt from that boundary's frame everywhere, including
   * the widened part, while a frame neither endpoint belongs to still blocks
   * the whole of it.
   */
  forEdge(from: string, to: string): ObstacleQuery {
    const framesFrom = this.framesOfNode.get(from);
    const framesTo = this.framesOfNode.get(to);
    const segmentCrosses = (a: Point, b: Point): boolean =>
      this.crosses(a, b, from, to, framesFrom, framesTo);
    return {
      segmentCrosses,
      polylineClear: (path) => {
        for (let i = 0; i < path.length - 1; i++) {
          if (segmentCrosses(path[i], path[i + 1])) return false;
        }
        return true;
      },
    };
  }

  private crosses(
    a: Point,
    b: Point,
    from: string,
    to: string,
    framesFrom: ReadonlySet<string> | undefined,
    framesTo: ReadonlySet<string> | undefined,
  ): boolean {
    // A non-finite coordinate cannot be placed in a cell: `col` / `row` clamp on
    // `< 0` and `>= cols`, and NaN fails both, so the query would walk no cells
    // and report a clear segment. The flat scan this replaced reported the
    // opposite, because `segmentCrossesRect`'s comparisons against a NaN slope
    // all fail and leave the span at its full extent. Degenerate geometry is a
    // bug upstream either way, but it must not be the one answer that lets a
    // route through unchecked, so the exact clip decides it over every
    // obstacle, exactly as it used to.
    const candidates = isFinitePoint(a) && isFinitePoint(b) ? this.near(a, b) : this.allIds();
    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      const owner = this.owner[id];
      if (this.isFramePiece[id]) {
        if (framesFrom?.has(owner) || framesTo?.has(owner)) continue;
      } else if (owner === from || owner === to) {
        continue;
      }
      if (segmentCrossesRect(a, b, this.rects[id])) return true;
    }
    return false;
  }

  /** Ids the grid offers for the segment's bounding box. */
  private near(a: Point, b: Point): number[] {
    return this.grid.query(
      a.x < b.x ? a.x : b.x,
      a.y < b.y ? a.y : b.y,
      a.x < b.x ? b.x : a.x,
      a.y < b.y ? b.y : a.y,
      this.candidates,
    );
  }

  /** Every id, for the degenerate query the grid cannot place. */
  private allIds(): number[] {
    this.candidates.length = 0;
    for (let i = 0; i < this.rects.length; i++) this.candidates.push(i);
    return this.candidates;
  }
}
