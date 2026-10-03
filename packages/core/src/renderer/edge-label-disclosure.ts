/**
 * Progressive disclosure of edge labels: the canvas tier (#3022).
 *
 * The canvas is the first tier of reading an edge. It shows at most
 * `label-max-chars` of a label, and under `label-display: auto` only a label
 * that can be seated clear of cards, labels and foreign lines. What it leaves
 * off is not lost: the authored text stays on the edge group as
 * `data-edge-label` (ADR-1554) and in a `<title>`, so every surface can
 * disclose it on demand (TPL-3022).
 *
 * This module holds the one definition of "the text the canvas draws". The
 * placement pass measures it and `renderEdge` draws it; if the two computed it
 * separately the pass would move a box wider or narrower than the text on the
 * canvas.
 */

import type { ResolvedEdgeStyle } from "../types/style.js";
import type { LayoutEdge } from "./layout-types.js";

const ELLIPSIS = "…";
const ZWJ = "\u200D";
const COMBINING_MARK = /^\p{M}$/u;

/** A code point that attaches to the one before it: a combining mark, a joiner, a variation selector. */
function isClusterGlue(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return ch === ZWJ || ch === "\uFE0E" || ch === "\uFE0F" || COMBINING_MARK.test(ch);
}

/**
 * Why the canvas shows less than the authored label, as written to
 * `data-edge-label-withheld`.
 *
 * - `truncated`: the label is drawn, cut to `label-max-chars`
 * - `deferred`: the label is not drawn at all
 */
export type LabelWithheld = "truncated" | "deferred";

/**
 * The text the canvas draws for `label`. Returns `label` itself when it fits,
 * so a label within the budget is byte-identical to the unbudgeted output.
 *
 * Counts code points, so a surrogate pair is never split, and backs the cut
 * off a combining mark or a zero-width joiner, so a letter never loses its
 * accent and an emoji sequence is never left half-joined. (Code points rather
 * than `Intl.Segmenter` graphemes: the same label must be cut at the same
 * place by every runtime that renders it.)
 *
 * Cuts at a word boundary when that keeps most of the budget: a label chopped
 * mid-word ("authorizes every req…") reads as noise, one cut between words
 * ("authorizes every request…") reads as a sentence that continues.
 */
export function displayEdgeLabel(label: string, maxChars: number | undefined): string {
  if (maxChars === undefined || !Number.isFinite(maxChars)) return label;
  const chars = Array.from(label);
  if (chars.length <= maxChars) return label;
  // One place is the ellipsis's own, so the drawn text never exceeds the budget.
  let budget = Math.floor(maxChars) - 1;
  // Never cut inside a cluster: not before a mark that modifies the previous
  // character, and not on either side of a joiner.
  while (budget > 0 && (isClusterGlue(chars[budget]) || chars[budget - 1] === ZWJ)) budget--;
  if (budget <= 0) return ELLIPSIS;
  let cut = chars.slice(0, budget).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(budget * 0.6)) cut = cut.slice(0, space);
  // Trailing punctuation left by the cut would sit against the ellipsis.
  cut = cut.replace(/[\s,;:(/\-–]+$/u, "");
  return cut + ELLIPSIS;
}

/** What the canvas does with one edge's label. */
export interface CanvasLabel {
  /** The text the canvas draws: the authored label, or its truncation. */
  text: string;
  /**
   * `always`: drawn wherever it lands. `auto`: drawn only if the placement
   * pass seats it clear. `hover`: never drawn.
   */
  display: ResolvedEdgeStyle["labelDisplay"];
}

/**
 * The canvas treatment of `edge`'s label under `style`, or `undefined` when
 * the edge has no label.
 *
 * Two kinds of label are never withheld, whatever the style says, because
 * withholding them would leave no way back to them (TPL-3022):
 *
 * - A **synthetic** label (`N domain edges`, the `W` / `R` markers) is not
 *   authored text, so it is not on the group as `data-edge-label` (ADR-1554)
 *   and a viewer has nothing to disclose it from. It is also never truncated.
 * - A label that is the **click target** of the aggregated-edge detail panel
 *   (`domainEdges`, ADR-463). Leaving it off the canvas would leave an
 *   invisible control.
 */
export function canvasLabel(
  edge: Pick<LayoutEdge, "label" | "syntheticLabel" | "domainEdges">,
  style: Pick<ResolvedEdgeStyle, "labelMaxChars" | "labelDisplay">,
): CanvasLabel | undefined {
  if (!edge.label) return undefined;
  if (edge.syntheticLabel) return { text: edge.label, display: "always" };
  const text = displayEdgeLabel(edge.label, style.labelMaxChars);
  const isControl = edge.domainEdges !== undefined && edge.domainEdges.length > 0;
  return { text, display: isControl ? "always" : style.labelDisplay };
}
