/**
 * Geometry constants shared across the layout modules (#2512): container
 * chrome, ghost margins, and the per-display-mode gap set. Card-level
 * tunables (text width, paddings, chips) live in `rendering-constants.ts`.
 */
import type { DisplayMode } from "./layout-types.js";

export const CONTAINER_PADDING = 40;
export const CONTAINER_LABEL_HEIGHT = 30;
export const GHOST_MARGIN = 30;

// Per-mode gap constants. Shape values are the historical defaults tuned
// for variable-width cards (~250px). Icon values are tuned for uniform
// 160-wide cards — see docs/design/icon-mode-layout-tuning.md.
export function getLayoutConstants(displayMode?: DisplayMode): {
  LAYER_GAP: number;
  NODE_GAP: number;
  MAX_LAYER_WIDTH: number;
} {
  if (displayMode === "icon") {
    return { LAYER_GAP: 80, NODE_GAP: 36, MAX_LAYER_WIDTH: 1040 };
  }
  return { LAYER_GAP: 120, NODE_GAP: 60, MAX_LAYER_WIDTH: 1200 };
}
