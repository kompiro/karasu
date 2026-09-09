/**
 * Uniform grid over axis-aligned bounding boxes — the broad phase shared by the
 * crossing-mark pass (segment ↔ segment) and the label-placement pass (label
 * box ↔ node card / committed label / edge segment). See #2760.
 *
 * The grid is a **prefilter only** and never decides anything by itself. A
 * query returns every inserted box that shares at least one cell with the query
 * box, which is a superset of the boxes whose *closed* bounds intersect it: two
 * closed intervals that intersect (touching counts) share a point, and both
 * cover the cell that point falls in, because the cell index is a monotone
 * function of the coordinate. The caller then runs the exact test it ran
 * before on each candidate, in the order it needs, so the candidate set can be
 * a superset but never a subset and the pass's output is unchanged.
 *
 * Coordinates outside the extent the grid was sized for clamp to the border
 * cells. Clamping is monotone too, so the guarantee holds for a box inserted
 * later than the extent was measured (a committed label box off the diagram
 * edge); it only makes that border cell fuller.
 */

/** Smallest cell the size chooser returns, so a swarm of tiny boxes cannot shatter the grid. */
const MIN_CELL = 16;
/**
 * Most cells along either axis. A box covers at most this many cells per axis,
 * which bounds the insertion cost of one very long segment on a huge canvas.
 */
const MAX_CELLS_PER_AXIS = 512;

/**
 * Cell size for a grid spanning `extentW × extentH` that will hold `sizes.length`
 * boxes of the given characteristic sizes (a segment's length, a card's longer
 * side). Two estimates, and the smaller wins:
 *
 *   - the **median size**, so a typical box covers about one cell;
 *   - the **density size** `√(area / count)`, the cell that holds about one box
 *     if they were spread evenly. A canvas whose edges mostly span it (a store
 *     canvas: median segment ≈ 1000 px on a 6000 × 5000 extent) would otherwise
 *     get a handful of cells and degrade to the all-pairs loop; a long box is
 *     cheap to insert into a row of small cells, while a big cell makes every
 *     box in it a candidate for every other.
 *
 * The result is floored at `MIN_CELL` and raised until neither axis needs more
 * than `MAX_CELLS_PER_AXIS` cells. An estimate that is not finite is ignored;
 * when neither is usable (no sizes, all zero, a zero extent) the floor is the
 * answer, which is still a correct (if coarse) grid.
 */
export function chooseCellSize(sizes: ArrayLike<number>, extentW: number, extentH: number): number {
  let cell = Number.POSITIVE_INFINITY;
  if (sizes.length > 0) {
    const sorted = Float64Array.from(sizes).sort();
    const median = sorted[sorted.length >> 1];
    if (Number.isFinite(median) && median < cell) cell = median;
    const density = Math.sqrt((extentW * extentH) / sizes.length);
    if (Number.isFinite(density) && density < cell) cell = density;
  }
  if (!(cell > MIN_CELL) || !Number.isFinite(cell)) cell = MIN_CELL;
  for (const extent of [extentW, extentH]) {
    if (Number.isFinite(extent) && extent / cell > MAX_CELLS_PER_AXIS)
      cell = extent / MAX_CELLS_PER_AXIS;
  }
  return cell;
}

export class BoxGrid {
  private readonly cellSize: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly cols: number;
  private readonly rows: number;
  /** Cell key (`row * cols + col`) → ids of the boxes covering that cell, in insertion order. */
  private readonly cells = new Map<number, number[]>();
  /** Per id, the query that last reported it — the O(1) dedupe for a box spanning several cells. */
  private stamps = new Uint32Array(64);
  private queryId = 0;

  /**
   * Grid over the extent `[minX, maxX] × [minY, maxY]` with square cells of
   * `cellSize` (see `chooseCellSize`). Boxes inserted outside the extent are
   * clamped to the border cells.
   */
  constructor(cellSize: number, minX: number, minY: number, maxX: number, maxY: number) {
    this.cellSize = cellSize > 0 && Number.isFinite(cellSize) ? cellSize : MIN_CELL;
    this.originX = Number.isFinite(minX) ? minX : 0;
    this.originY = Number.isFinite(minY) ? minY : 0;
    this.cols = this.axisCells(maxX - this.originX);
    this.rows = this.axisCells(maxY - this.originY);
  }

  private axisCells(extent: number): number {
    if (!(extent > 0) || !Number.isFinite(extent)) return 1;
    return Math.min(MAX_CELLS_PER_AXIS, Math.floor(extent / this.cellSize) + 1);
  }

  private col(x: number): number {
    const c = Math.floor((x - this.originX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor((y - this.originY) / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Register the closed box `[minX, maxX] × [minY, maxY]` under `id` (a small non-negative integer). */
  insert(id: number, minX: number, minY: number, maxX: number, maxY: number): void {
    if (id >= this.stamps.length) {
      const grown = new Uint32Array(Math.max(id + 1, this.stamps.length * 2));
      grown.set(this.stamps);
      this.stamps = grown;
    }
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = r * this.cols + c;
        const list = this.cells.get(key);
        if (list) list.push(id);
        else this.cells.set(key, [id]);
      }
    }
  }

  /**
   * Every id whose box shares a cell with the closed query box — each id once,
   * in no particular order (callers that need an order sort the result).
   * Fills and returns `out` so a hot loop can reuse one array.
   */
  query(minX: number, minY: number, maxX: number, maxY: number, out: number[]): number[] {
    out.length = 0;
    const stamp = ++this.queryId;
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = this.cells.get(r * this.cols + c);
        if (!list) continue;
        for (const id of list) {
          if (this.stamps[id] === stamp) continue;
          this.stamps[id] = stamp;
          out.push(id);
        }
      }
    }
    return out;
  }
}
