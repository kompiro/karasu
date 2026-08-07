/**
 * Shared numeric constants used across SVG rendering pipeline.
 * Centralised here to avoid duplication across layout, deploy-layout,
 * svg-renderer, and org-renderer.
 */

// Text-measurement constants
export const CHAR_WIDTH = 9; // approximate px per character at base font size
export const NODE_PADDING_X = 40; // horizontal padding inside nodes
export const NODE_PADDING_Y = 24; // vertical padding inside nodes

// Text-stack layout constants shared by layout.ts / deploy-layout.ts
// measurement and (eventually) the renderer's drawn line advance (#2366 B).
export const LINE_HEIGHT = 18; // px reserved per text line in node measurement
export const DESCRIPTION_FONT_RATIO = 0.85; // description char-width ratio (measurement)
export const META_FONT_RATIO = 0.7; // meta row char-width ratio

// Icon-mode text layout constants
export const ICON_LABEL_CHAR_WIDTH = 7.5; // approximate for 13px font
export const ICON_DESC_CHAR_WIDTH = 6.5; // approximate for 11px font
export const ICON_DESC_MAX_WIDTH = 144; // px available for description text

/**
 * Estimated display width of a single character. CJK characters (code point
 * above U+2E80) count as 1.5× `charWidth`, everything else as 1× `charWidth`.
 *
 * This is the shared heuristic used by node measurement (layout / deploy-layout)
 * and text fitting (svg-builder's truncate/wrap). `renderer/matrix-svg.ts`
 * intentionally uses a different, wider-coverage heuristic tuned for table
 * column sizing — see the comment there before unifying the two.
 */
export function charDisplayWidth(ch: string, charWidth: number): number {
  return ch.charCodeAt(0) > 0x2e80 ? charWidth * 1.5 : charWidth;
}

/**
 * Estimate the rendered pixel width of `text` at `charWidth` px per character,
 * counting CJK characters as 1.5× via {@link charDisplayWidth}.
 */
export function estimateTextWidth(text: string, charWidth: number): number {
  let width = 0;
  for (const ch of text) {
    width += charDisplayWidth(ch, charWidth);
  }
  return width;
}

/** Grapheme budget for the `👥` owner chip on a node card before elision. */
const TEAM_CHIP_MAX_CHARS = 15;

/**
 * The owner chip's display string — the team's label (or id), elided at
 * {@link TEAM_CHIP_MAX_CHARS}. Shared by `measureNode` and the renderer so the
 * reserved width always matches the drawn text; labels can be much longer than
 * the team ids the chip used to show (Issue #2157).
 */
export function teamChipText(teamLabel: string): string {
  const chars = [...teamLabel];
  return chars.length > TEAM_CHIP_MAX_CHARS
    ? chars.slice(0, TEAM_CHIP_MAX_CHARS).join("") + "…"
    : teamLabel;
}
