import { KRS_KEYWORD_NAMES, isBareWord } from "../lexer/lexer.js";

/**
 * Determines whether an identifier string can be emitted bare (without
 * surrounding quotes) by the formatter, and re-quotes it when needed so
 * that round-trip parsing is preserved.
 *
 * A string can be emitted bare only if the lexer reads it back as one plain
 * identifier: the word shape and the keyword set both come from the lexer
 * (#2707). This file used to hand-copy both. The copy missed `boundary`,
 * `contains`, `facet`, `facets` and `operations`, so `from: "boundary"` was
 * printed bare and read back as a keyword, and its pattern tested code points
 * where the lexer tests UTF-16 units, so an id with a character outside the
 * BMP was printed bare and lost that character when read back.
 */

/**
 * Spellings the lexer reads as plain identifiers but the parser reserves by
 * value. `store` opens a deploy unit (`DEPLOY_KEYWORDS` in the parser, which
 * this module cannot import without a cycle through `parser/node-path.ts`).
 */
const VALUE_MATCHED_KEYWORDS = ["store"];

const RESERVED_KEYWORDS = new Set([...KRS_KEYWORD_NAMES, ...VALUE_MATCHED_KEYWORDS]);

export function needsQuotes(id: string): boolean {
  if (id.length === 0) return true;
  if (!isBareWord(id)) return true;
  if (RESERVED_KEYWORDS.has(id)) return true;
  return false;
}

/**
 * Wrap a string in the `.krs` string-literal form, escaping backslashes first
 * and then embedded double quotes.
 *
 * Split out from {@link quoteId} because a caller can have its own reason to
 * quote: `nodePathRefId` (#2714) quotes a path segment that carries the `.`
 * separator, which is a narrower trigger than "cannot be emitted bare". The
 * escaping itself must stay one rule, so both go through here.
 */
export function quotedIdLiteral(id: string): string {
  const escaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function quoteId(id: string): string {
  if (!needsQuotes(id)) return id;
  return quotedIdLiteral(id);
}
