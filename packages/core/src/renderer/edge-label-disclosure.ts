/**
 * Progressive disclosure of edge labels (#3022, spike).
 *
 * The canvas is the first tier: it shows at most `label-max-chars` of a label,
 * and under `label-display: auto` only a label that can be seated clear. The
 * withheld text is not lost: it stays on the edge group (`data-edge-label`),
 * where the preview's hover tooltip reads it, and in a `<title>` for a static
 * SVG's native tooltip.
 *
 * Kept dependency-free so both the placement pass (which must measure the text
 * actually drawn) and `renderEdge` (which draws it) read one definition without
 * importing each other.
 */

const ELLIPSIS = "…";

/** What `renderEdge` is told about one edge's label beyond its style. */
export interface EdgeLabelDisclosure {
  /** The placement pass could not seat the label clear (`label-display: auto`). */
  deferred?: boolean;
  /**
   * Emit the withheld text as a `<title>`. On for static output; the
   * interactive preview turns it off because it shows its own tooltip.
   */
  nativeTitle?: boolean;
}

/**
 * The text the canvas draws for `label`. Returns `label` itself when it fits,
 * so a short label is byte-identical to today's output.
 *
 * Cuts at a word boundary when that keeps most of the budget: a label chopped
 * mid-word ("authorizes every req…") reads as noise, one cut between words
 * ("authorizes every request…") reads as a sentence that continues.
 */
export function displayEdgeLabel(label: string, maxChars: number | undefined): string {
  if (maxChars === undefined || !Number.isFinite(maxChars) || label.length <= maxChars) {
    return label;
  }
  const budget = Math.max(1, Math.floor(maxChars) - 1);
  let cut = label.slice(0, budget);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(budget * 0.6)) cut = cut.slice(0, space);
  cut = cut.replace(/[\s,;:(/\-–]+$/u, "");
  return cut + ELLIPSIS;
}
