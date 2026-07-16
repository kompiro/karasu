/**
 * Shared core-AST → LSP position conversion.
 *
 * Core positions are 1-based; LSP positions are 0-based. This is the single
 * most correctness-critical arithmetic in the package, so it lives in one
 * leaf module (no imports) instead of being copied per consumer.
 */

/** An LSP position: 0-based `line` / `character`. */
export interface LspPosition {
  line: number;
  character: number;
}

/** An LSP range built from two {@link LspPosition}s. */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** A core-AST source range: 1-based `line` / `column` points. */
export interface SourceRangeLike {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/** Core positions are 1-based; LSP positions are 0-based. */
function toLspPosition(line: number, column: number): LspPosition {
  // Clamp to 0 to guard against synthetic EOF tokens (line: 0, column: 0).
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, column - 1),
  };
}

/** Convert a core-AST source range to an LSP range (both points clamped). */
export function toLspRange(loc: SourceRangeLike): LspRange {
  return {
    start: toLspPosition(loc.start.line, loc.start.column),
    end: toLspPosition(loc.end.line, loc.end.column),
  };
}
