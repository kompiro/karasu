import type { SourceRange, Token } from "../types/tokens.js";

/**
 * Attach the sheet's file to a range when the parse was given one, omitting
 * the key otherwise, so a sheet parsed without a path compares equal to the
 * shape it had before (#2715, TPL-2715). Every caller hands in a range it has
 * just built, so assigning in place is safe and spares a copy per range.
 *
 * The free range helpers below take `file` as a required parameter rather than
 * an optional one: a range built without it would silently lose the sheet's
 * identity, and this way a new call site cannot forget to pass it.
 */
export function inFile(range: SourceRange, file: string | undefined): SourceRange {
  if (file !== undefined) range.file = file;
  return range;
}

export function tokenLoc(token: Token, file: string | undefined): SourceRange {
  const len = token.value.length;
  return inFile(
    {
      start: { ...token.loc },
      end: {
        line: token.loc.line,
        column: token.loc.column + len,
        offset: token.loc.offset + len,
      },
    },
    file,
  );
}

export function rangeBetweenTokens(
  start: Token,
  end: Token,
  file: string | undefined,
): SourceRange {
  const len = end.value.length;
  return inFile(
    {
      start: { ...start.loc },
      end: {
        line: end.loc.line,
        column: end.loc.column + len,
        offset: end.loc.offset + len,
      },
    },
    file,
  );
}
