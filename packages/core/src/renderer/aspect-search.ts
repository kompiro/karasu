/**
 * Canvas width-budget search (Issue #2593).
 *
 * The layout bounds the **sibling axis** twice — `GRID_COLUMN_CAP` and
 * `MAX_LAYER_WIDTH` — and never bounds the **layer axis**: every wrap and
 * every new layer grows the canvas downward. A model with many layers, or
 * with cards a hair too wide for three to fit inside the fixed 1200px row
 * budget, therefore renders as a tall narrow ribbon that zoom-to-fit shrinks
 * below a graspable resolution (`docs/concepts.md`, scoped glance →
 * resolution axis).
 *
 * The missing piece is a feedback loop: nothing in the pipeline ever looks at
 * the bounding box it just produced. This module adds one without giving up
 * determinism. The placement arithmetic is pure, so it can simply be re-run
 * over a fixed ascending list of candidate width budgets; the run with the
 * **smallest canvas inside a screen-shaped aspect band** wins. Content area is
 * constant across the runs, so the smallest canvas is the one with the least
 * empty space.
 *
 * - **Deterministic.** Same input → same candidate list → same winner → same
 *   SVG. No randomness, no annealing, no iteration to a fixed point, and
 *   nothing about the viewport enters the computation (the CLI renders
 *   headless).
 * - **Floor first.** The first candidate is the current constant, and only a
 *   strictly smaller canvas displaces it. A canvas no wider budget can shrink
 *   therefore keeps byte-identical output. Note this is a claim about area,
 *   not about shape: a landscape canvas is *not* automatically safe, because a
 *   wider budget can still drop a row and come out smaller.
 * - **Self-limiting.** Once every row fits on one line, wider budgets change
 *   nothing, and the caller says so through `exhausted`, which ends the search.
 *
 * The canvas is deliberately **not** assumed monotone in the budget. A wider
 * budget usually trades height for width, but a row's height is the tallest
 * card in it, so re-wrapping cards of differing heights can raise the total —
 * measured: seven non-uniform cards go from 1430 to 1492 tall between budgets
 * 1200 and 1412. An earlier revision stopped the search at the first canvas
 * past the top of the aspect band on the strength of that assumption; it now
 * evaluates every candidate unless `exhausted` says the result cannot move.
 */

/**
 * Aspect band the canvas must land inside: from portrait 16:9 to landscape
 * 16:9. A canvas inside this band fits a screen-shaped viewport without a
 * large blank margin on either axis, and the band is symmetric in log space so
 * neither orientation is privileged. It is a constraint, not a target — the
 * search minimises empty space and only uses the band to rule out the
 * degenerate ends, where shelf packing always looks cheap on paper (a canvas
 * nine times wider than tall wastes little area and is unreadable).
 */
export const MAX_CANVAS_ASPECT = 16 / 9;
export const MIN_CANVAS_ASPECT = 9 / 16;

/** How far above the floor the search is allowed to look. */
const MAX_BUDGET_MULTIPLE = 6;

/** Number of candidate budgets, floor included. */
const BUDGET_STEPS = 12;

/**
 * Candidate width budgets in ascending order, `floor` first.
 *
 * Geometric rather than linear: wrap decisions are scale-free (a row either
 * fits one more card or it does not), so a constant *ratio* between candidates
 * samples the reachable canvases evenly. Rounded to integers and de-duplicated
 * so the list is stable across platforms.
 */
export function candidateWidthBudgets(
  floor: number,
  maxMultiple: number = MAX_BUDGET_MULTIPLE,
  steps: number = BUDGET_STEPS,
): number[] {
  if (!(floor > 0) || steps < 1) return [floor];
  const ratio = Math.pow(maxMultiple, 1 / Math.max(1, steps - 1));
  const out: number[] = [];
  for (let k = 0; k < steps; k++) {
    const value = Math.round(floor * Math.pow(ratio, k));
    if (out.length === 0 || value > out[out.length - 1]) out.push(value);
  }
  return out;
}

/** Whether a canvas is inside the readable aspect band. */
export function withinAspectBand(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const aspect = width / height;
  return aspect >= MIN_CANVAS_ASPECT && aspect <= MAX_CANVAS_ASPECT;
}

/**
 * Distance from square, in log space, so that "twice as tall" and "twice as
 * wide" score the same. Used only to break ties between canvases of equal
 * area, and to pick the least-bad candidate when none is inside the band.
 */
export function squareness(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return Infinity;
  return Math.abs(Math.log(width / height));
}

export interface BudgetSearchResult<T> {
  result: T;
  /**
   * The winning candidate. Callers surface it on their result so a test or a
   * debugging session can see which candidate produced the canvas.
   */
  budget: number;
}

/**
 * Run `place` once per candidate budget and keep the **smallest canvas** that
 * stays inside the aspect band.
 *
 * The content area is the same in every run, so the smallest canvas is the one
 * with the least empty space — which is the thing a reader actually sees. An
 * aspect target alone does not get there: on the dify model, picking the
 * squarest canvas saves 2% of the total area while picking the smallest one
 * inside the band saves 20%.
 *
 * Ties go to the earlier (smaller) budget, so the floor keeps its own
 * placement whenever widening buys nothing. When no candidate is inside the
 * band, the closest-to-square one wins, so a view that cannot be helped still
 * renders.
 *
 * `place` must be pure — it is called several times and only the winning
 * call's result is used.
 */
export function searchWidthBudget<T>(
  place: (budget: number) => T,
  /**
   * Measures a candidate. `exhausted` reports that widening cannot change this
   * result at all, which ends the search immediately — a caller that cannot
   * tell simply omits it.
   */
  size: (result: T) => { width: number; height: number; exhausted?: boolean },
  opts: {
    floor: number;
    maxMultiple?: number;
    steps?: number;
  },
): BudgetSearchResult<T> {
  const candidates = candidateWidthBudgets(opts.floor, opts.maxMultiple, opts.steps);

  let best: BudgetSearchResult<T> | null = null;
  let bestArea = Infinity;
  // Fallback for a model no budget can bring inside the band.
  let fallback: BudgetSearchResult<T> | null = null;
  let fallbackSquareness = Infinity;

  for (const budget of candidates) {
    const result = place(budget);
    const { width, height, exhausted } = size(result);
    const found: BudgetSearchResult<T> = { result, budget };
    const shape = squareness(width, height);

    if (withinAspectBand(width, height)) {
      const area = width * height;
      // Strictly smaller only. An equal-area candidate has merely rearranged
      // the same canvas, and letting it win on any secondary score would take
      // the floor's placement away for no gain — the floor-first rule this
      // module rests on (TPL-2593).
      if (area < bestArea - 1e-9) {
        best = found;
        bestArea = area;
      }
    } else if (fallback === null || shape < fallbackSquareness) {
      // Also covers the degenerate canvas (an empty view measures 0 x 0):
      // every candidate scores Infinity, and the first one still has to win so
      // the caller gets a result instead of a crash.
      fallback = found;
      fallbackSquareness = shape;
    }

    // Nothing left to try: the caller has told us this result is insensitive
    // to the budget, so no later candidate can differ. This is the only sound
    // early exit — the caller derives it from the one channel the budget
    // reaches the placement through.
    if (exhausted) break;
  }

  return best ?? fallback!;
}
