import type { SourceRange } from "./tokens.js";

/**
 * Structured representation of a single `.krs.style` property value.
 *
 * Phase 3 of `docs/design/style-ast-shape.md`. The parser produces a
 * `ValueNode` alongside the existing `properties: Record<string, string>`
 * so a future validator pass (PR-B) can emit value-level diagnostics
 * without re-parsing strings, and so each ValueNode carries enough
 * positional information (`loc`) to underline a specific token rather
 * than the whole declaration.
 *
 * Resolver / Tidy / svg-builder still read the string side. The string
 * remains the canonical persistence form; ValueNode is a derived view
 * (see TPL-20260510-18 and the design doc's roadmap section).
 */
export type ValueNode =
  /** Bare identifier — e.g. `down`, `bold`, `red`, `solid`. */
  | { kind: "ident"; value: string; loc: SourceRange }
  /** Hex color literal including the leading `#` — e.g. `#1A2B3C`. */
  | { kind: "hex"; value: string; loc: SourceRange }
  /** Unitless numeric value — e.g. `0.6`, `1.5`. */
  | { kind: "number"; value: number; raw: string; loc: SourceRange }
  /**
   * Numeric value with a unit suffix — e.g. `12px`, `1.5px`. Both `value`
   * (parsed number) and `raw` (the original source text without the
   * unit) are kept so downstream code can either compute or echo
   * faithfully.
   */
  | { kind: "length"; value: number; unit: string; raw: string; loc: SourceRange }
  /** Quoted string literal — e.g. `"Noto Sans JP"`. `value` is unquoted. */
  | { kind: "string"; value: string; loc: SourceRange }
  /**
   * Function-style value — only `url(...)` is parsed today. `argRaw`
   * keeps the inside of the parens verbatim (without surrounding quotes
   * if the argument was a string literal).
   */
  | { kind: "function"; name: string; argRaw: string; loc: SourceRange }
  /**
   * Comma-separated list — e.g. `"Noto Sans JP", sans-serif`. Each
   * `item` is a fully parsed ValueNode itself.
   */
  | { kind: "list"; items: ValueNode[]; loc: SourceRange };
