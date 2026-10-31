import type { Token, SourceRange } from "../types/tokens.js";
import type { Diagnostic, DiagnosticCode, DiagnosticParamsByCode } from "../types/ast.js";
import type { ParseContext } from "./parse-context.js";

/**
 * Dropping the construct a parser error rejects (#3072).
 *
 * An error is syntax karasu does not accept: the rejected construct is kept out
 * of the model, and the unit removed is exactly that construct (ADR-2677
 * decision 9). A rejecting branch therefore reads the construct whole, the way
 * an accepting branch would, and only then reports it over the range it
 * covered. Consuming only the keyword lets the rest fall through to the
 * enclosing block as unrelated errors: a misplaced `database` with a body used
 * to raise nine of them and close its system early.
 */

/** Report `code` over a construct the caller has already consumed whole. */
export function rejectConstruct<K extends DiagnosticCode>(
  ctx: ParseContext,
  loc: SourceRange,
  code: K,
  params: DiagnosticParamsByCode[K],
): void {
  ctx.pushDiagnostic({ severity: "error", code, params, loc } as Diagnostic);
}

/**
 * Reject a property written on a kind that does not take it. `readValue` is
 * the property's own value reader, so the value is consumed as an accepting
 * kind would consume it and the diagnostic spans keyword through value.
 */
export function rejectProperty(
  ctx: ParseContext,
  property: DiagnosticParamsByCode["property-not-for-node-kind"]["property"],
  nodeKind: string,
  readValue: (keyword: Token) => unknown,
): void {
  const keyword = ctx.advance();
  readValue(keyword);
  rejectConstruct(ctx, ctx.range(keyword.loc, ctx.previous().loc), "property-not-for-node-kind", {
    property,
    nodeKind,
  });
}
