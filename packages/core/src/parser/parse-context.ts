import type { Token, TokenType, SourceRange } from "../types/tokens.js";
import type { Diagnostic, DiagnosticCode, DiagnosticParamsByCode } from "../types/ast.js";
import type { TokenCursor } from "./kebab-name.js";

/**
 * The parser's primitives, handed to the parsing functions that live outside
 * `parser.ts` (#3441).
 *
 * Extracted modules take this context instead of importing the parser, so no
 * import cycle forms: this module is a leaf, and only `parser.ts` builds the
 * object (once, in its constructor; the LSP re-parses on every keystroke).
 * Every member reads or writes the parser's own state, so a diagnostic pushed
 * here lands in the same array, in the same order, as one the parser pushes.
 */
export interface ParseContext extends TokenCursor {
  /** Consume a token of `type`, or report `token-type-mismatch` and leave it in place. */
  expect(type: TokenType): Token;
  /** Consume the next token when it is of `type`. */
  match(type: TokenType): boolean;
  /** Report an error anchored at the next token. */
  error<K extends DiagnosticCode>(code: K, params: DiagnosticParamsByCode[K]): void;
  /** Build a source range stamped with the file path; see `Parser.range`. */
  range(start: Token["loc"], end?: Token["loc"]): SourceRange;
  /** Append a diagnostic built by the caller (a warning, or one anchored elsewhere). */
  pushDiagnostic(diagnostic: Diagnostic): void;
  /** The token consumed last. */
  previous(): Token;
  /**
   * Run `parse` and drop every diagnostic it pushed, for recovery that consumes
   * input whose complaints would point at the wrong fix.
   */
  discardDiagnostics<T>(parse: () => T): T;
}
