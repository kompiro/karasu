import type { Token, TokenType, SourceRange } from "../types/tokens.js";
import type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticParamsByCode,
  KrsEdge,
  KrsNode,
} from "../types/ast.js";
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
  /**
   * Append diagnostics built by the caller (a warning, one anchored elsewhere,
   * or a validator's whole result), in the order given.
   */
  pushDiagnostic(...diagnostics: Diagnostic[]): void;
  /** The token consumed last, or `undefined` before the first one is consumed. */
  previous(): Token | undefined;
  /**
   * Run `parse` and drop every diagnostic it pushed, for recovery that consumes
   * input whose complaints would point at the wrong fix.
   */
  discardDiagnostics<T>(parse: () => T): T;
  /**
   * Parse a node declaration when the next token opens one. The block parsers
   * reach node declarations through this, since node-parser.ts imports them
   * (#3441): a block's child nodes, and a misplaced one that a block which
   * takes no nodes must still read whole (#3463).
   */
  tryParseNodeDecl(): KrsNode | undefined;
  /**
   * Parse an edge when the next token opens one, for a block that takes no
   * edges but must still read a misplaced one whole (#3499). The org parsers
   * reach `parseEdge` only through this, since edge-parser.ts imports them.
   */
  tryParseEdge(): KrsEdge | undefined;
}
