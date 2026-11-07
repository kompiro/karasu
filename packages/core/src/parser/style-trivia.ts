import type { Token, Trivia } from "../types/tokens.js";

/**
 * Consume the leading trivia attached to `token` and clear it on the token
 * so the same trivia is not visible to a later splitter call.
 */
export function takeLeadingTrivia(token: Token): Trivia[] {
  const trivia = token.leadingTrivia ?? [];
  token.leadingTrivia = [];
  return trivia;
}

/**
 * Split `nextToken.leadingTrivia` into trivia that occurs on `boundaryLine`
 * (returned as `sameLine`) and the rest, which is left attached to the
 * token as its remaining `leadingTrivia`. The same-line slice is the
 * trailing trivia of whatever construct ended on `boundaryLine`.
 */
export function splitSameLineTrivia(
  nextToken: Token,
  boundaryLine: number,
): { sameLine: Trivia[] } {
  const trivia = nextToken.leadingTrivia ?? [];
  if (trivia.length === 0) return { sameLine: [] };
  const sameLine: Trivia[] = [];
  const rest: Trivia[] = [];
  let stillSameLine = true;
  for (const t of trivia) {
    if (stillSameLine && t.kind !== "blank-line" && t.loc.start.line === boundaryLine) {
      sameLine.push(t);
    } else {
      stillSameLine = false;
      rest.push(t);
    }
  }
  nextToken.leadingTrivia = rest;
  return { sameLine };
}
