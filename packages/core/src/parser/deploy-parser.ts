import { TokenType, type Token } from "../types/tokens.js";
import type {
  DeployBlock,
  DeployNode,
  DeployNodeKind,
  DeployNodeProperties,
} from "../types/ast.js";
import { DEPLOY_KEYWORDS } from "./parser-keywords.js";
import { handleNestedLegend } from "./legend-parser.js";
import { commaSeparatedValues, readReferencePathElement } from "./property-readers.js";
import { rejectEdge } from "./rejected-construct.js";
import type { ParseContext } from "./parse-context.js";

// The `deploy` block and its units (`oci`, `lambda`, `store`, …), including the
// `realizes` list that ties a unit to the logical nodes it ships. Free
// functions over the parse context (#3441).

const DEPLOY_PROPERTY_KEYWORDS = new Set<string>([
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
]);

export function parseDeployBlock(ctx: ParseContext): DeployBlock {
  const start = ctx.advance(); // deploy
  // Accept identifier (new: deploy Production) or string literal (legacy: deploy "name")
  const idToken =
    ctx.peek().type === TokenType.Identifier ? ctx.advance() : ctx.expect(TokenType.StringLiteral);
  ctx.expect(TokenType.LeftBrace);

  const nodes: DeployNode[] = [];
  let label: string | undefined;

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    if (ctx.peek().value === "label") {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral || ctx.peek().type === TokenType.Identifier) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-property-value", { propName: "label" });
      }
    } else if (DEPLOY_KEYWORDS.has(ctx.peek().value)) {
      nodes.push(parseDeployNode(ctx));
    } else if (ctx.peek().type === TokenType.Legend) {
      handleNestedLegend(ctx, "deploy");
    } else if (!rejectEdge(ctx, "deploy")) {
      ctx.error("unexpected-token-in-block", {
        blockKind: "deploy",
        tokenType: String(ctx.peek().type),
        value: ctx.peek().value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    id: idToken.value,
    label,
    nodes,
    loc: ctx.range(start.loc, end.loc),
  };
}

function parseDeployNode(ctx: ParseContext): DeployNode {
  const start = ctx.advance(); // deploy kind keyword
  const kind = start.value as DeployNodeKind;
  // Accept identifier (new: oci myApp) or string literal (legacy: oci "my-app")
  const idToken =
    ctx.peek().type === TokenType.Identifier ? ctx.advance() : ctx.expect(TokenType.StringLiteral);
  ctx.expect(TokenType.LeftBrace);

  const properties: DeployNodeProperties = {};
  let label: string | undefined;

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    if (ctx.peek().value === "label") {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral || ctx.peek().type === TokenType.Identifier) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-property-value", { propName: "label" });
      }
    } else if (DEPLOY_PROPERTY_KEYWORDS.has(ctx.peek().value)) {
      const propToken = ctx.advance();
      const propName = propToken.value as keyof DeployNodeProperties;
      if (propName === "realizes") {
        parseRealizesList(ctx, propToken, properties);
      } else if (
        // Value can be string literal or identifier
        ctx.peek().type === TokenType.StringLiteral ||
        ctx.peek().type === TokenType.Identifier
      ) {
        (properties as Record<string, string>)[propName] = ctx.advance().value;
      } else {
        ctx.error("expected-property-value", { propName });
      }
    } else if (ctx.peek().type === TokenType.Legend) {
      handleNestedLegend(ctx, kind);
    } else if (!rejectEdge(ctx, "deploy node")) {
      ctx.error("unexpected-token-in-block", {
        blockKind: "deploy node",
        tokenType: String(ctx.peek().type),
        value: ctx.peek().value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    kind,
    id: idToken.value,
    label,
    properties,
    loc: ctx.range(start.loc, end.loc),
  };
}

/**
 * Parses the value of one `realizes` line, appending to the node's target
 * list. Targets may be written one per line (#409) or comma-separated on a
 * single line (#2167) — the comma form is sugar, so both append to the same
 * array and a node mixing the two accumulates in document order.
 *
 * The list grammar itself lives in `commaSeparatedValues`, which every
 * reference list shares (#2551); a target is a node reference path, whose
 * dots continue the one ref even across a line break.
 */
function parseRealizesList(
  ctx: ParseContext,
  keyword: Token,
  properties: DeployNodeProperties,
): void {
  for (const first of commaSeparatedValues(ctx, keyword, "realizes")) {
    const target = readReferencePathElement(ctx, first, "realizes");
    if (!target) continue;
    // Naming the same target twice declares one relation, not two (#2552).
    // The repeat is dropped wherever it sits — later in this list or on a
    // line of its own — the way `facets` has always treated a repeated id,
    // and the entry that survives is the first, so the recorded range points
    // at the spelling the author wrote first. Recording both instead makes
    // consumers that count entries disagree with consumers that key by
    // identity: the deploy layout reserved a grid cell per entry while
    // `layoutNodes` coalesced the two placements, leaving a container sized
    // for a unit that is never drawn.
    const targets = (properties.realizes ??= []);
    const already = targets.some(
      (t) =>
        t.path.length === target.path.length && t.path.every((seg, i) => seg === target.path[i]),
    );
    if (!already) targets.push(target);
  }
}
