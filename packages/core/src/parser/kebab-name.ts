import { TokenType, type Token } from "../types/tokens.js";
import { KRS_KEYWORD_TOKEN_TYPES } from "../lexer/lexer.js";

/**
 * Minimal cursor view over a parser's token stream, so the kebab-name
 * stitching below can be shared between call sites without exposing the
 * parser's private token plumbing.
 */
export interface TokenCursor {
  peek(): Token;
  peekAt(offset: number): Token;
  advance(): Token;
}

/**
 * Stitch a kebab-case name back together from `first` and the tokens that
 * follow it (#2509).
 *
 * The `.krs` lexer does not include `-` in identifier characters (it must
 * lex `->` / `-->` edge arrows), so a kebab-case name like
 * `my-team-internal-tag` arrives as a `<word> - <word> - ...` token run with
 * each dash as a standalone `Identifier("-")`. Every open-vocabulary name
 * position (tags, annotation names, capability names, legend refs) shares
 * this helper so the same spelling lexes to the same name everywhere —
 * the `.krs.style` lexer already folds hyphens into identifiers, and a tag
 * written in `.krs` must match the selector written in `.krs.style`
 * (TPL-1415).
 *
 * A fragment may be a keyword token (`[legacy-system]`, `[read-only]`):
 * keywords are ordinary words in vocabulary positions, exactly as
 * `parseTags` already accepts them stand-alone.
 */
export function stitchKebabTail(first: Token, cursor: TokenCursor): { name: string; end: Token } {
  let name = first.value;
  let end = first;
  while (
    cursor.peek().type === TokenType.Identifier &&
    cursor.peek().value === "-" &&
    isWordToken(cursor.peekAt(1))
  ) {
    cursor.advance(); // -
    const next = cursor.advance();
    name += `-${next.value}`;
    end = next;
  }
  return { name, end };
}

/** A token that can serve as a kebab-name fragment: an identifier that is an
 * actual word (not a stray `-` / `--`), or any keyword token. */
function isWordToken(token: Token): boolean {
  if (token.type === TokenType.Identifier) {
    return token.value !== "-" && token.value !== "--";
  }
  return KRS_KEYWORD_TOKEN_TYPES.has(token.type);
}
