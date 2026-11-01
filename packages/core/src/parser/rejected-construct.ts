import type { Token, SourceRange } from "../types/tokens.js";
import type { Diagnostic, DiagnosticCode, DiagnosticParamsByCode, KrsNode } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
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
 * Consume a rejected keyword and the value `readValue` reads after it, and
 * return the range from the keyword through the end of the value. What the
 * reader reports about the value is dropped: a value for a keyword that cannot
 * be written here has nothing to fix.
 */
export function consumeRejected(
  ctx: ParseContext,
  readValue: (keyword: Token) => unknown,
): SourceRange {
  const keyword = ctx.advance();
  ctx.discardDiagnostics(() => readValue(keyword));
  const last = ctx.previous() ?? keyword;
  return ctx.range(keyword.loc, last.end ?? last.loc);
}

/**
 * Reject a property written on a kind that does not take it. `readValue` is
 * the property's own value reader, so the value is consumed as an accepting
 * kind would consume it.
 */
export function rejectProperty(
  ctx: ParseContext,
  property: DiagnosticParamsByCode["property-not-for-node-kind"]["property"],
  nodeKind: string,
  readValue: (keyword: Token) => unknown,
): void {
  const loc = consumeRejected(ctx, readValue);
  rejectConstruct(ctx, loc, "property-not-for-node-kind", { property, nodeKind });
}

/**
 * Reject a node declared where its kind cannot be placed, after it was parsed
 * whole. The code says which placement rule it broke: an infra block belongs
 * directly under `system`, an `entity` under a `domain`, and every other kind
 * where the containment table lists it. Its body's own mistakes stay reported,
 * because the node is valid once moved.
 */
export function rejectNode(ctx: ParseContext, node: KrsNode, parentKind: string): void {
  if (INFRA_KIND_SET.has(node.kind)) {
    const params = { infraKind: node.kind, parentKind };
    rejectConstruct(ctx, node.loc, "infra-not-in-context", params);
  } else if (node.kind === "entity") {
    rejectConstruct(ctx, node.loc, "entity-not-in-domain", { parentKind });
  } else {
    const params = { childKind: node.kind, parentKind };
    rejectConstruct(ctx, node.loc, "node-not-in-context", params);
  }
}
