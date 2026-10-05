/**
 * Whether the preview may draw a freshly compiled diagram.
 *
 * `.krs language v2.0` defines an error as syntax karasu does not accept, and no
 * surface draws a new diagram while one stands (#2677). The app republishes the
 * last valid SVG for the same compile target (`useDebouncedCompile`); the CLI
 * exits 1. The preview follows the app: it keeps the last valid SVG while the
 * target is unchanged, and otherwise shows that drawing is blocked. Core still
 * returns an SVG of whatever it could recover, so the gate has to live here.
 */

export interface LastValidRender<T> {
  /** Identifies what was compiled: document, view type, display mode, theme, drill-down path. */
  key: string;
  /** What was drawn: the SVG and whatever metadata goes with it. */
  value: T;
}

export type GateDecision<T> =
  | { kind: "draw"; value: T; remember: LastValidRender<T> }
  | { kind: "keep"; value: T }
  | { kind: "blocked"; errorCount: number };

export function gateRender<T>(params: {
  key: string;
  value: T;
  errorCount: number;
  lastValid: LastValidRender<T> | undefined;
}): GateDecision<T> {
  const { key, value, errorCount, lastValid } = params;
  if (errorCount === 0) return { kind: "draw", value, remember: { key, value } };
  if (lastValid && lastValid.key === key) return { kind: "keep", value: lastValid.value };
  return { kind: "blocked", errorCount };
}
