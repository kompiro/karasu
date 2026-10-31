import { TokenType, type Token, type SourceRange } from "../types/tokens.js";
import { nearestToolAnnotation } from "../builtins/tool-vocabulary.js";
import { isBareWord } from "../lexer/lexer.js";
import { stitchKebabTail } from "./kebab-name.js";
import { annotationParamKind } from "./parser-keywords.js";
import type { ParseContext } from "./parse-context.js";

// The tag list and annotations a declaration carries: `[tag, …]` and
// `@name(key: value, …)`. Free functions over the parse context (#3441); every
// diagnostic goes through `ctx.pushDiagnostic`, so it lands in the parser's
// array in the order the parser would have pushed it.

/** Where the parameter list stops being read: its `)`, EOF, or a brace that shows the `)` is missing. */
function isAnnotationParamListEnd(token: Token): boolean {
  return token.type !== TokenType.Comma && isAnnotationParamBoundary(token);
}

/**
 * A token that can be a whole annotation parameter value: a string literal, or
 * an identifier that is an actual word. The lexer also emits `-`, `--` and
 * `#…` as identifiers; none of those is a value (#2707).
 */
function isAnnotationParamValueToken(token: Token): boolean {
  if (token.type === TokenType.StringLiteral) return true;
  return token.type === TokenType.Identifier && isBareWord(token.value);
}

/**
 * Where one annotation parameter value ends: the next pair, the list's end, or
 * EOF. A brace ends it too. No key or value contains one, so a brace means the
 * `)` is missing and the declaration's block has begun (or ended); reading on
 * would swallow the declarations that follow.
 */
function isAnnotationParamBoundary(token: Token): boolean {
  return (
    token.type === TokenType.Comma ||
    token.type === TokenType.RightParen ||
    token.type === TokenType.EOF ||
    token.type === TokenType.LeftBrace ||
    token.type === TokenType.RightBrace
  );
}

export function parseTags(ctx: ParseContext): string[] {
  const tags: string[] = [];
  if (ctx.peek().type !== TokenType.LeftBracket) return tags;

  ctx.advance(); // [
  while (ctx.peek().type !== TokenType.RightBracket && ctx.peek().type !== TokenType.EOF) {
    if (ctx.peek().type === TokenType.Comma) {
      ctx.advance();
      continue;
    }
    // A tag value: an identifier, or a keyword token doubling as a tag name
    // (e.g. `[table]`). A kebab-case tag arrives as a `<word> - <word>` run
    // (the lexer emits `-` as its own token) — stitch it back into one tag
    // (#2509) so `[my-team-internal-tag]` is one tag, not seven.
    const first = ctx.advance();
    tags.push(stitchKebabTail(first, ctx).name);
  }
  ctx.expect(TokenType.RightBracket);
  return tags;
}

export function parseAnnotations(ctx: ParseContext): {
  names: string[];
  params: Record<string, Record<string, string>>;
} {
  const names: string[] = [];
  const params: Record<string, Record<string, string>> = {};
  while (ctx.peek().type === TokenType.At) {
    ctx.advance(); // @
    if (ctx.peek().type !== TokenType.Identifier) continue;
    // Kebab-case annotation names (`@my-team-mark`) arrive as a
    // `<word> - <word>` token run — stitch, same as tags (#2509).
    const nameToken = ctx.advance();
    const { name, end: nameEnd } = stitchKebabTail(nameToken, ctx);
    // A near-miss of a builtin name is rejected (`.krs language v2.0`, #2677):
    // the author meant the builtin, and keeping the misspelling would silently
    // drop its effect. It stays out of the model, parameters included.
    const suggestion = nearestToolAnnotation(name);
    if (suggestion !== undefined) {
      ctx.pushDiagnostic({
        severity: "error",
        code: "annotation-possible-typo",
        params: { annotation: name, suggestion },
        loc: ctx.range(nameToken.loc, nameEnd.end ?? nameEnd.loc),
      });
      skipAnnotationParamList(ctx);
      continue;
    }
    if (names.includes(name)) {
      // A repeat says nothing the first occurrence did not, and
      // `annotationParams` holds one slot per name, so it cannot carry a
      // parameter of its own either (#2707).
      ctx.pushDiagnostic({
        severity: "warning",
        code: "duplicate-annotation",
        params: { annotation: name },
        // `nameEnd` is the last *token* of the (possibly kebab) name, so its
        // `loc` is where that fragment starts. End the range past it, or the
        // range over `@deprecated` collapses to a point and a kebab name
        // loses its final fragment (#2707 review).
        loc: ctx.range(nameToken.loc, nameEnd.end ?? nameEnd.loc),
      });
    }
    names.push(name);
    // Optional parameters: `@name(key: "value"[, key: "value"]*)`.
    if (ctx.peek().type === TokenType.LeftParen) {
      ctx.advance(); // (
      while (!isAnnotationParamListEnd(ctx.peek())) {
        // Skip separators between pairs.
        if (ctx.peek().type === TokenType.Comma || ctx.peek().type === TokenType.Colon) {
          ctx.advance();
          continue;
        }
        // Key name: an identifier, or a keyword that doubles as a key
        // (e.g. `from`, which the lexer tokenizes as a keyword). Read by
        // value so keyword-keys aren't mistaken for missing.
        const keyToken = ctx.advance();
        const key = keyToken.value;
        if (ctx.peek().type === TokenType.Colon) ctx.advance();
        const read = readAnnotationParamValue(ctx, keyToken);
        if (annotationParamKind(name, key) === undefined) {
          // Accepted-vocabulary rule (TPL-1503): a param with no
          // effect is warned, not silently kept. Only builtin keys have an
          // effect; custom annotations stay param-less for now (#1568).
          // Its value is not judged: whatever it says, it has no effect.
          ctx.pushDiagnostic({
            severity: "warning",
            code: "annotation-param-unsupported",
            params: { annotation: name, key },
            loc: ctx.range(keyToken.loc),
          });
        } else if (read.kind === "unreadable") {
          // Record nothing: the formatter emits what this map holds, so
          // storing a fallback would make `fmt` write a value the author
          // never typed (#2571 review). A warning, so the model still
          // renders (`karasu render` refuses a file with errors, and the
          // spec promises a lifecycle annotation never gates rendering).
          // `format()` refuses this code by name instead, so `fmt --write`
          // cannot print the bare annotation over what the author wrote
          // (`FORMAT_BLOCKING_CODES`, #2707).
          ctx.pushDiagnostic({
            severity: "warning",
            code: "annotation-param-value-unreadable",
            params: { annotation: name, key },
            loc: read.loc,
          });
        } else {
          const slot = (params[name] ??= {});
          if (!Object.hasOwn(slot, key)) {
            slot[key] = read.value;
          } else if (slot[key] !== read.value) {
            // The AST keeps one value per annotation and key, so a second,
            // different value cannot be represented. Keep the first and
            // reject the second. Like the unreadable value above, it is a
            // warning that `format()` refuses by name, so rendering works
            // and `fmt` does not print the first value over the second
            // (#2707).
            ctx.pushDiagnostic({
              severity: "warning",
              code: "annotation-param-conflict",
              params: { annotation: name, key, existing: slot[key], value: read.value },
              loc: ctx.range(keyToken.loc, read.token.end ?? read.token.loc),
            });
          }
        }
        if (ctx.peek().type === TokenType.Comma) ctx.advance();
      }
      // A missing `)` stops at the block's brace (see
      // `isAnnotationParamBoundary`) and is reported there, so the block and
      // the declarations after it still parse.
      if (ctx.peek().type !== TokenType.EOF) ctx.expect(TokenType.RightParen);
    }
  }
  return { names, params };
}

/**
 * Consume a rejected annotation's `( … )` list without judging it: its
 * parameters belong to an annotation that is not in the model, so warning
 * about them would only repeat the rejection.
 */
function skipAnnotationParamList(ctx: ParseContext): void {
  if (ctx.peek().type !== TokenType.LeftParen) return;
  ctx.advance(); // (
  while (!isAnnotationParamListEnd(ctx.peek())) ctx.advance();
  if (ctx.peek().type !== TokenType.EOF) ctx.expect(TokenType.RightParen);
}

/**
 * Read one annotation parameter value: a single string literal or bare word
 * standing alone before `,` / `)` / EOF.
 *
 * Everything else is consumed up to the next pair and reported unreadable: a
 * word starting with a digit (`2026`), a keyword (`system`), a run of tokens
 * (`2026-12-31`, `Legacy-Monolith`, `Shop.Legacy`), or no value at all. A run
 * must not be read by its first token. That recorded `until: "-"` for
 * `2026-12-31` and `from: "Legacy"` for `Legacy-Monolith`, then read the rest
 * as the next key. Consuming it also keeps a diagnostic from naming a value
 * token as a key the author never wrote (#2571 review, #2707).
 *
 * Every value the formatter prints bare (`quoteId`) is a bare word, so it
 * reads back as itself here.
 */
function readAnnotationParamValue(
  ctx: ParseContext,
  keyToken: Token,
): { kind: "value"; value: string; token: Token } | { kind: "unreadable"; loc: SourceRange } {
  const first = ctx.peek();
  const standsAlone = isAnnotationParamBoundary(ctx.peekAt(1));
  if (isAnnotationParamValueToken(first) && standsAlone) {
    ctx.advance();
    return { kind: "value", value: first.value, token: first };
  }
  let last = keyToken;
  while (!isAnnotationParamBoundary(ctx.peek())) {
    last = ctx.advance();
  }
  return {
    kind: "unreadable",
    loc:
      last === keyToken
        ? ctx.range(keyToken.loc, keyToken.end ?? keyToken.loc)
        : ctx.range(first.loc, last.end ?? last.loc),
  };
}
