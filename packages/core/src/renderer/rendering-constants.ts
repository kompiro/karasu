/**
 * Shared numeric constants used across SVG rendering pipeline.
 * Centralised here to avoid duplication across layout, deploy-layout,
 * svg-renderer, and org-renderer.
 */

// Text-measurement constants
export const CHAR_WIDTH = 9; // approximate px per character at base font size
export const NODE_PADDING_X = 40; // horizontal padding inside nodes
export const NODE_PADDING_Y = 24; // vertical padding inside nodes

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
