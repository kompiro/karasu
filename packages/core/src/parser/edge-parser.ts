import { TokenType, type Token, type SourceLocation } from "../types/tokens.js";
import type { KrsEdge, LinkEntry, NodeIdPath } from "../types/ast.js";
import { readNodeIdPathTail } from "./node-path.js";
import { parseTags } from "./annotation-parser.js";
import { parseDescriptionValue, parseLink, parseIdOrString } from "./property-readers.js";
import { parseFacetsList } from "./org-parser.js";
import type { ParseContext } from "./parse-context.js";

// Edges (`A -> B`, `A --> B`) and their optional property block, plus the
// `#id` author suffix that edges and resource rows share. Free functions over
// the parse context (#3441).

/**
 * True when `token` (the current token) begins an explicit edge: an
 * identifier or string literal followed by `->` (sync) or `-->` (async).
 */
export function isEdgeStart(ctx: ParseContext, token: Token): boolean {
  return (
    (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
    (ctx.peekAt(1).type === TokenType.Arrow || ctx.peekAt(1).type === TokenType.DashedArrow)
  );
}
export function parseEdge(ctx: ParseContext, implicitFrom?: string): KrsEdge {
  let fromValue: string;
  let startLoc: SourceLocation;
  if (implicitFrom) {
    // Implicit source: arrow token is first, source ID comes from parent block
    fromValue = implicitFrom;
    startLoc = ctx.peek().loc;
  } else {
    const fromToken = ctx.advance(); // from identifier or string literal
    fromValue = fromToken.value;
    startLoc = fromToken.loc;
  }
  const arrowToken = ctx.advance(); // -> or -->
  const toToken = parseIdOrString(ctx, "edge target");

  // Support qualified references at any depth: `Sys.Svc`, `Sys.Svc.Domain`, …
  // The two-segment cap lifted with slice E (#2577), together with the
  // resolution that gives the deeper form an effect — accepting a spelling
  // that resolves nowhere is what TPL-1503 forbids. Entity relations share
  // this reader, so deep qualifiers on them lift here too (#2575).
  let toValue = toToken.value;
  let toPath: NodeIdPath | undefined;
  let toEnd = toToken.loc;
  if (ctx.peek().type === TokenType.Dot) {
    const tail = readNodeIdPathTail(toToken, ctx, {
      acceptStringSegments: true,
    });
    // On a dangling dot, keep this site's historical recovery: report, leave
    // the bad token unconsumed, and still join its value into the target.
    if (tail.dangling) {
      ctx.error("expected-id-or-string", { context: "qualified edge target" });
    }
    const segments = tail.dangling ? [...tail.segments, tail.dangling.value] : tail.segments;
    toValue = segments.join(".");
    // Kept beside the joined value, from the same array, so the two cannot
    // disagree. The join is lossy where a segment holds a dot of its own, and
    // the formatter is what needs the boundary back (#2650).
    toPath = segments;
    toEnd = (tail.dangling ?? tail.end).loc;
  }

  let label: string | undefined;
  if (ctx.peek().type === TokenType.StringLiteral) {
    label = ctx.advance().value;
  }

  const tags = parseTags(ctx);
  const authorId = parseAuthorIdSuffix(ctx);
  const block = parseEdgeBlock(ctx, label);
  if (block.label !== undefined) label = block.label;

  return {
    from: fromValue,
    to: toValue,
    ...(toPath !== undefined ? { toPath } : {}),
    label,
    kind: arrowToken.type === TokenType.DashedArrow ? "async" : "sync",
    tags,
    // Ends at the target for the shorthand, exactly as before, so every
    // existing diagnostic keeps its range. A block form is the first edge
    // that spans more than one line, and the range has to cover it: the
    // formatter tracks the last line an item occupied to decide which
    // comments lead the *next* sibling, so a short range hands the block's
    // own comments to the edge after it (#2543).
    loc: ctx.range(startLoc, block.closeLoc ?? toEnd),
    ...(authorId !== undefined ? { authorId } : {}),
    ...(block.description !== undefined ? { description: block.description } : {}),
    ...(block.links !== undefined ? { links: block.links } : {}),
    ...(block.facets !== undefined && block.facets.length > 0 ? { facets: block.facets } : {}),
  };
}

/**
 * The optional edge property block, `A -> B [async] #id { … }`. Additive by
 * construction: no other construct starts with `{`, and no valid file has a
 * bare `{` on the line after an edge, so a file that does not write one
 * parses exactly as it did before (#2543).
 *
 * Accepts `label` / `description` / `link` / `facets`, all spelled the same
 * way as on a node. `positionalLabel` is passed in so writing the label twice
 * is an error (`duplicate-edge-label`) instead of one form silently winning;
 * the positional one is kept for recovery.
 */
function parseEdgeBlock(
  ctx: ParseContext,
  positionalLabel: string | undefined,
): {
  label?: string;
  description?: string;
  links?: LinkEntry[];
  facets?: string[];
  /** Location of the closing `}`, so `parseEdge` can span its range over the block. */
  closeLoc?: SourceLocation;
} {
  if (ctx.peek().type !== TokenType.LeftBrace) return {};
  ctx.advance(); // {

  let label: string | undefined;
  let description: string | undefined;
  let links: LinkEntry[] | undefined;
  let facets: string[] | undefined;

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();

    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type !== TokenType.StringLiteral) {
        ctx.error("expected-string-after", { property: "label" });
        continue;
      }
      const value = ctx.peek().value;
      if (positionalLabel !== undefined) {
        ctx.error("duplicate-edge-label", { label: value });
      }
      ctx.advance();
      if (positionalLabel === undefined) label = value;
      continue;
    }

    if (token.type === TokenType.Description) {
      ctx.advance();
      description = parseDescriptionValue(ctx);
      continue;
    }

    if (token.type === TokenType.Link) {
      ctx.advance();
      (links ??= []).push(parseLink(ctx));
      continue;
    }

    // Cross-cutting membership, on the same reader nodes use (#2544): repeated
    // lines accumulate into one array and duplicate ids collapse, so `facets a`
    // twice and `facets a, a` are the same edge.
    if (token.type === TokenType.Facets) {
      const keyword = ctx.advance();
      facets ??= [];
      parseFacetsList(ctx, keyword, facets);
      continue;
    }

    ctx.error("unexpected-token-in-block", {
      blockKind: "edge",
      tokenType: String(token.type),
      value: token.value,
    });
    ctx.advance();
  }

  const close = ctx.expect(TokenType.RightBrace);

  return {
    closeLoc: close.loc,
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(links !== undefined ? { links } : {}),
    ...(facets !== undefined ? { facets } : {}),
  };
}

/**
 * Optional `#<id>` author identifier for edges and resource rows. The lexer
 * already emits `#foo` as a single Identifier token, so we just check the
 * leading `#`. Returns the id without the leading `#`, or undefined if the
 * next token is something else.
 */
export function parseAuthorIdSuffix(ctx: ParseContext): string | undefined {
  const next = ctx.peek();
  if (next.type !== TokenType.Identifier) return undefined;
  if (!next.value.startsWith("#")) return undefined;
  if (next.value.length === 1) return undefined;
  ctx.advance();
  return next.value.slice(1);
}
