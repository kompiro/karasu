import { TokenType, type Token, type SourceRange, type SourceLocation } from "../types/tokens.js";
import type { LinkEntry, NodeIdPath, HandlesTarget } from "../types/ast.js";
import { isRecognizedResourceOperation } from "../spec/operations.js";
import { ALLOWED_LINK_SCHEMES, parseUrlScheme } from "./link-url.js";
import { readNodeIdPathTail } from "./node-path.js";
import type { ParseContext } from "./parse-context.js";

// The readers for the values properties take, shared by every block parser:
// descriptions, links, ids, and the comma-separated lists behind `handles`,
// `operations`, `facets` and the reference properties. Free functions over the
// parse context (#3441).

/** Intermediate shape returned by `parseOperationsList` before per-resource validation. */
export interface ParsedOperation {
  verb: string;
  /**
   * Decorated CRUD candidates. `undefined` = no `:` decoration was present
   * (bare verb). `[]` = `:` was present but RHS was empty (will produce
   * `empty-crud-decoration`). Otherwise each entry's `recognized` flag tells
   * the resource builder whether to count it or emit `invalid-crud-decoration`.
   */
  decoration: { value: string; recognized: boolean }[] | undefined;
  /** Loc of the verb token (for diagnostic positioning). */
  decorationLoc: SourceLocation | undefined;
}

export function parseDescriptionValue(ctx: ParseContext): string {
  if (ctx.peek().type === TokenType.TripleQuote) {
    return ctx.advance().value;
  }
  if (ctx.peek().type === TokenType.StringLiteral) {
    return ctx.advance().value;
  }
  ctx.error("expected-string-after", { property: "description" });
  return "";
}

export function parseLink(ctx: ParseContext): LinkEntry {
  const start = ctx.peek().loc;
  const url = ctx.expect(TokenType.StringLiteral);
  let label: string | undefined;
  let end = url.loc;
  if (ctx.peek().type === TokenType.StringLiteral) {
    const labelToken = ctx.advance();
    label = labelToken.value;
    end = labelToken.loc;
  }
  const loc = ctx.range(start, end);
  // Trust-boundary scheme allowlist (#1525 / TPL-168): link URLs are
  // untrusted .krs content rendered as <a href> in the app and the VS Code
  // webview, where a javascript: URL executes in the app origin. We WARN here
  // (validate once at the boundary) but keep the link in the AST so Format /
  // round-trip never silently deletes the user's source. The href-rendering
  // surfaces filter with isSafeLinkUrl before creating an anchor. The WHATWG
  // URL parser matches browser href semantics (case folding, tab/newline
  // stripping), so tricks like "JaVaScRiPt:" normalize before the check;
  // anything unparseable (incl. relative paths) is reported too.
  const scheme = parseUrlScheme(url.value);
  if (scheme === null || !ALLOWED_LINK_SCHEMES.has(scheme)) {
    ctx.pushDiagnostic({
      severity: "warning",
      code: "link-url-scheme-not-allowed",
      params: { url: url.value, scheme: scheme ?? "" },
      loc,
    });
  }
  return { url: url.value, label, loc };
}

/**
 * Walk the comma-separated value list a property keyword introduces, yielding
 * the token that opens each element. The caller consumes whatever else its
 * element spans (a reference path's dotted tail, an `operations` decoration)
 * before the generator resumes, so one grammar serves elements of any shape.
 * Callers must drain the generator: breaking out of the loop early leaves the
 * rest of the list for the enclosing block to misread.
 *
 * The four decisions the property readers used to hold their own copies of
 * live here instead (#2551):
 *
 * - **A list never jumps a line on its own.** Every separator, and every
 *   element after one, sits on the line where the previous element ended, so
 *   neither a trailing comma nor a comma opening the next line extends the
 *   list across a break, and the same intent is not silently accepted in one
 *   direction and reported in the other (#2167). An element that spans lines
 *   itself carries the list with it: the rule bounds separators and element
 *   starts, not the characters of one element.
 * - **A separator with no element is one `expected-id-after`**, anchored on
 *   the offending comma in either direction, or on the keyword when the value
 *   is missing outright. `ctx.error` anchors on whatever comes next, which
 *   for a trailing comma is the following (correct) line.
 * - **Stray separators are swallowed and the list resumes**, so `facets ,pii`
 *   still records `pii` and the block loop never reports the same comma twice.
 * - **Elements are yielded as tokens**, so element-precise ranges are there
 *   for the taking rather than re-derived per property.
 */
export function* commaSeparatedValues(
  ctx: ParseContext,
  keyword: Token,
  property: string,
): Generator<Token> {
  // The line the list is currently on. It starts at the keyword and moves with
  // an element that spans lines of its own, so the list never jumps a line by
  // itself and never truncates an element that legitimately crosses one.
  let line = keyword.loc.line;
  const onListLine = (token: Token): boolean => token.loc.line === line;
  const atElement = (): boolean => isIdOrString(ctx.peek()) && onListLine(ctx.peek());

  // The separator the parser is standing after, for the diagnostic below.
  // Undefined while reading the first element, which the keyword introduces.
  let afterComma: Token | undefined;

  for (;;) {
    if (atElement()) {
      yield ctx.advance();
      // The caller may have consumed more than the token yielded above, and a
      // reference path's dots carry one element across a line break. The
      // separator that follows therefore sits where the element ended, not
      // where the keyword did, so `handles Order` with `.Line, Catalog` on the
      // next line still reads `Catalog` instead of dropping it.
      line = (ctx.previous() ?? keyword).loc.line;
      // Without a comma the list is done; with one, another element is due.
      // A malformed element takes the same exit as a good one, so the trailing
      // comma of `handles A.,` is reported where the trailing comma of
      // `handles A,` is. Swallowing it here would make the same mistake
      // silent in one spelling and reported in the other.
      if (ctx.peek().type !== TokenType.Comma || !onListLine(ctx.peek())) return;
      afterComma = ctx.advance();
      continue;
    }
    // No element where one is required: a bare keyword, a leading comma
    // (`facets ,b`), or the trailing comma of `facets a,`. Report it once
    // rather than letting the comma fall through to the block loop's generic
    // `unexpected-token-in-block`, and anchor it on the character at fault:
    // the separator when one is written, the keyword only when the value is
    // missing outright. A leading comma is still ahead of the cursor while a
    // trailing one has been consumed, so the anchor is read from whichever
    // side holds it; both land on the comma the author actually typed.
    const leading = ctx.peek();
    const anchor =
      afterComma ?? (leading.type === TokenType.Comma && onListLine(leading) ? leading : keyword);
    ctx.pushDiagnostic({
      severity: "error",
      code: "expected-id-after",
      params: { property },
      loc: ctx.range(anchor.loc, anchor.end),
    });
    // Swallow the stray separators so the same commas are not reported again,
    // then resume if that leaves an element to read. Reaching here without a
    // comma to consume means the line holds nothing more to say, so stop
    // rather than report twice.
    let swallowed = false;
    while (ctx.peek().type === TokenType.Comma && onListLine(ctx.peek())) {
      afterComma = ctx.advance();
      swallowed = true;
    }
    if (!swallowed || !atElement()) return;
  }
}

/**
 * Read the dotted tail of a reference-path element (#2088) whose opening token
 * has already been consumed, or `undefined` when the path is malformed.
 *
 * A dangling dot is reported once and records nothing: recording the segments
 * read so far would put `handles Backend` in the model next to an error about
 * `handles Backend.`. The range runs to the dot itself, so the squiggle covers
 * the character at fault instead of stopping at the identifier that was
 * spelled correctly.
 */
export function readReferencePathElement(
  ctx: ParseContext,
  first: Token,
  property: string,
): { path: NodeIdPath; loc: SourceRange } | undefined {
  const tail = readNodeIdPathTail(first, ctx, { acceptStringSegments: true });
  if (tail.dangling) {
    const stop = tail.danglingDot ?? tail.end;
    ctx.pushDiagnostic({
      severity: "error",
      code: "expected-id-after",
      params: { property },
      loc: ctx.range(first.loc, stop.end ?? stop.loc),
    });
    return undefined;
  }
  return {
    path: tail.segments,
    loc: ctx.range(first.loc, tail.end.end ?? tail.end.loc),
  };
}

/**
 * Parse the right-hand side of an `operations` property. Each entry is
 * either a bare verb (`create`, `list`) or a decorated verb (`list:read`,
 * `replace:create,delete`). Comma-separated; the comma after a decoration
 * RHS is recognised as a verb separator only when the next identifier is
 * followed by `:` — otherwise the bare identifier becomes a CRUD-RHS
 * continuation that the per-verb validator will accept (recognised CRUD)
 * or flag with `invalid-crud-decoration` (anything else).
 *
 * Diagnostics are *deferred* to the resource builder so the resourceId is
 * available; we return raw entries plus malformed-flag info here.
 */
export function parseOperationsList(ctx: ParseContext, keyword: Token): ParsedOperation[] {
  const out: ParsedOperation[] = [];
  for (const verbToken of commaSeparatedValues(ctx, keyword, "operations")) {
    out.push(parseOneOperation(ctx, verbToken));
  }
  return out;
}

function parseOneOperation(ctx: ParseContext, verbToken: Token): ParsedOperation {
  const verb = verbToken.value;
  if (ctx.peek().type !== TokenType.Colon) {
    return { verb, decoration: undefined, decorationLoc: undefined };
  }
  ctx.advance(); // consume `:`
  if (!isIdOrString(ctx.peek())) {
    // Empty RHS. `empty-crud-decoration` is raised later by the resource
    // builder, which has the resourceId the message needs.
    return { verb, decoration: [], decorationLoc: verbToken.loc };
  }
  const decoration = [consumeDecorationItem(ctx)];
  // A comma continues the RHS only while the identifier after it is not itself
  // a decorated verb (ADR-1046's 1:N rule). Every other comma is left for the
  // enclosing list, so the trailing separator of `operations list:read,` is
  // reported by the one rule that owns separators.
  //
  // The list's line rule deliberately does not reach in here: a decoration is
  // part of one element, and the rule bounds separators and element starts,
  // not the characters of a single element.
  while (
    ctx.peek().type === TokenType.Comma &&
    isIdOrString(ctx.peekAt(1)) &&
    ctx.peekAt(2).type !== TokenType.Colon
  ) {
    ctx.advance(); // consume `,`
    decoration.push(consumeDecorationItem(ctx));
  }
  return { verb, decoration, decorationLoc: verbToken.loc };
}

function consumeDecorationItem(ctx: ParseContext): { value: string; recognized: boolean } {
  const tok = ctx.advance();
  return { value: tok.value, recognized: isRecognizedResourceOperation(tok.value) };
}

/** Accepts an identifier or a string literal wherever an id may be written. */
function isIdOrString(token: Token): boolean {
  return token.type === TokenType.Identifier || token.type === TokenType.StringLiteral;
}

export function parseHandlesList(ctx: ParseContext, keyword: Token): HandlesTarget[] {
  const refs: HandlesTarget[] = [];
  for (const first of commaSeparatedValues(ctx, keyword, "handles")) {
    // A malformed ref does not end the list: `handles A., B` has to record
    // `B` the same way `realizes` does. Dropping out here would lose every
    // later target and leave the comma for the block loop to report again.
    const target = readReferencePathElement(ctx, first, "handles");
    if (target) refs.push(target);
  }
  return refs;
}

/** Accept either an identifier or a string literal as an id/reference token. */
export function parseIdOrString(ctx: ParseContext, context: string): Token {
  if (ctx.peek().type === TokenType.Identifier || ctx.peek().type === TokenType.StringLiteral) {
    return ctx.advance();
  }
  ctx.error("expected-id-or-string", { context });
  return ctx.peek();
}
