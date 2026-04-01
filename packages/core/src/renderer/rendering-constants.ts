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
