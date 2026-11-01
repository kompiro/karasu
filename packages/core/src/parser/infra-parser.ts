import { TokenType, type Token } from "../types/tokens.js";
import type {
  KrsNode,
  KrsEdge,
  CommonProperties,
  BoundaryBlock,
  TableNode,
  QueueItemNode,
  BucketNode,
} from "../types/ast.js";
import { rejectConstruct, rejectNode } from "./rejected-construct.js";
import { handleNestedLegend } from "./legend-parser.js";
import { parseTags, parseAnnotations } from "./annotation-parser.js";
import { parseDescriptionValue, parseLink, rejectMisplacedProperty } from "./property-readers.js";
import { parseBoundaryBlock, parseFacetsList, rejectNestedFacetBlock } from "./org-parser.js";
import { isEdgeStart, parseEdge } from "./edge-parser.js";
import type { ParseContext } from "./parse-context.js";

// The infra blocks (`database`, `queue`, `storage`) and their leaf
// sub-resources (`table`, `queue`, `bucket`). Free functions over the parse
// context (#3441). A misplaced node declaration is read through
// `ctx.tryParseNodeDecl`, since node-parser.ts imports this module.
/**
 * Parse a top-level infra block: `database`, `queue`, or `storage`.
 * Each has a body of sub-resource declarations:
 *   database → table
 *   queue    → queue (parsed as queue-item internally)
 *   storage  → bucket
 */
export function parseInfraBlock(
  ctx: ParseContext,
  start: Token,
  kind: "database" | "queue" | "storage",
): KrsNode {
  let id: string;
  let idToken: Token;
  if (ctx.peek().type !== TokenType.Identifier && ctx.peek().type !== TokenType.StringLiteral) {
    ctx.error("expected-node-id", { kind });
    id = "__missing_id";
    idToken = start;
  } else {
    idToken = ctx.advance();
    id = idToken.value;
  }

  const tags = parseTags(ctx);
  const { names: annotations, params: annotationParams } = parseAnnotations(ctx);
  const properties: CommonProperties & { label?: string; facets?: string[] } = { links: [] };
  const children: KrsNode[] = [];
  const edges: KrsEdge[] = [];
  const boundaries: BoundaryBlock[] = [];
  let end = idToken;

  if (ctx.peek().type === TokenType.LeftBrace) {
    ctx.advance();
    parseInfraBlockContents(ctx, children, edges, kind, properties, boundaries);
    end = ctx.expect(TokenType.RightBrace);
  }

  const base = {
    id,
    label: properties.label,
    tags,
    annotations,
    ...(Object.keys(annotationParams).length > 0 ? { annotationParams } : {}),
    children,
    edges,
    ...(boundaries.length > 0 ? { boundaries } : {}),
    ...(properties.facets && properties.facets.length > 0 ? { facets: properties.facets } : {}),
    loc: ctx.range(start.loc, end.loc),
    properties: {
      description: properties.description,
      links: properties.links,
    },
  };

  return { ...base, kind };
}

/** Parse the body of a database/queue/storage block. */
function parseInfraBlockContents(
  ctx: ParseContext,
  children: KrsNode[],
  edges: KrsEdge[],
  parentKind: "database" | "queue" | "storage",
  properties: CommonProperties & { label?: string; facets?: string[] },
  boundaries: BoundaryBlock[],
): void {
  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();

    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        properties.label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
      continue;
    }

    if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
      continue;
    }

    if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
      continue;
    }

    // Edge
    if (isEdgeStart(ctx, token)) {
      edges.push(parseEdge(ctx));
      continue;
    }

    // Sub-resource declarations
    const subNode = tryParseInfraSubNode(ctx, parentKind);
    if (subNode) {
      children.push(subNode);
      continue;
    }

    if (token.type === TokenType.Legend) {
      handleNestedLegend(ctx, parentKind);
      continue;
    }

    // Infra blocks draw a drill-down canvas of their leaf children, so they
    // host boundaries like any other container kind (#2036).
    if (token.type === TokenType.Boundary) {
      boundaries.push(parseBoundaryBlock(ctx));
      continue;
    }

    if (token.type === TokenType.Facets) {
      const keyword = ctx.advance();
      properties.facets ??= [];
      parseFacetsList(ctx, keyword, properties.facets);
      continue;
    }

    if (token.type === TokenType.Facet) {
      rejectNestedFacetBlock(ctx, parentKind);
      continue;
    }

    if (rejectMisplacedProperty(ctx, parentKind)) continue;
    if (rejectMisplacedDecl(ctx, parentKind, parentKind)) continue;

    ctx.error("unexpected-token-in-block", {
      blockKind: parentKind,
      tokenType: String(token.type),
      value: token.value,
    });
    ctx.advance();
  }
}

/**
 * Parse the body of a leaf sub-resource node (table, queue-item, bucket).
 * Only properties (label, description, link) and edges are allowed.
 * Child node declarations are intentionally excluded — sub-resources are leaf nodes
 * and must not contain nested infra blocks or logical node declarations.
 * Note: TokenType.Table and TokenType.Bucket are deliberately absent from
 * LOGICAL_KEYWORDS and isNodeKeywordType for the same reason.
 */
function parseLeafNodeContents(
  ctx: ParseContext,
  edges: KrsEdge[],
  properties: CommonProperties & { label?: string; facets?: string[] },
  kind: "table" | "queue-item" | "bucket",
): void {
  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();

    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        properties.label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
      continue;
    }

    if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
      continue;
    }

    if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
      continue;
    }

    if (isEdgeStart(ctx, token)) {
      edges.push(parseEdge(ctx));
      continue;
    }

    // A leaf holds no canvas, but it does hold data — a `table` is the
    // canonical carrier of a regulatory facet (CHD, PII), so `facets` is
    // accepted here exactly as on every other kind.
    if (token.type === TokenType.Facets) {
      const keyword = ctx.advance();
      properties.facets ??= [];
      parseFacetsList(ctx, keyword, properties.facets);
      continue;
    }

    if (token.type === TokenType.Facet) {
      rejectNestedFacetBlock(ctx, kind);
      continue;
    }

    // A leaf draws no canvas, so a boundary here would have nothing to frame.
    // Named explicitly rather than falling through to unexpected-token, which
    // would not say why (#2036).
    if (token.type === TokenType.Boundary) {
      const block = parseBoundaryBlock(ctx);
      ctx.pushDiagnostic({
        severity: "error",
        code: "boundary-not-in-context",
        params: { parentKind: kind },
        loc: block.loc,
      });
      continue;
    }

    if (rejectMisplacedProperty(ctx, kind)) continue;
    if (rejectMisplacedDecl(ctx, kind, "sub-resource")) continue;

    ctx.error("unexpected-token-in-block", {
      blockKind: "sub-resource",
      tokenType: String(token.type),
      value: token.value,
    });
    ctx.advance();
  }
}

/** Try to parse a sub-resource node for the given parent infra kind. Returns null if not applicable. */
function tryParseInfraSubNode(
  ctx: ParseContext,
  parentKind: "database" | "queue" | "storage",
): KrsNode | null {
  const token = ctx.peek();

  if (parentKind === "database" && token.type === TokenType.Table) {
    return parseInfraSubNode(ctx, "table");
  }
  if (parentKind === "queue" && token.type === TokenType.Queue) {
    return parseInfraSubNode(ctx, "queue-item");
  }
  if (parentKind === "storage" && token.type === TokenType.Bucket) {
    return parseInfraSubNode(ctx, "bucket");
  }

  return null;
}

/**
 * Read a declaration an infra or sub-resource body does not take whole and
 * report it once (#3463): a node by its placement rule, and a `table` or
 * `bucket` the parent kind does not hold as an unexpected token over the
 * whole declaration. Returns false when the next token opens neither.
 */
function rejectMisplacedDecl(ctx: ParseContext, parentKind: string, blockKind: string): boolean {
  const token = ctx.peek();
  const node = ctx.tryParseNodeDecl();
  if (node) {
    rejectNode(ctx, node, parentKind);
    return true;
  }
  const sub =
    token.type === TokenType.Table
      ? "table"
      : token.type === TokenType.Bucket
        ? "bucket"
        : undefined;
  if (!sub) return false;
  const params = { blockKind, tokenType: String(token.type), value: token.value };
  rejectConstruct(ctx, parseInfraSubNode(ctx, sub).loc, "unexpected-token-in-block", params);
  return true;
}

/** Parse a sub-resource node (table, queue-item, bucket). */
function parseInfraSubNode(ctx: ParseContext, kind: "table" | "queue-item" | "bucket"): KrsNode {
  const start = ctx.advance(); // keyword token (table / queue / bucket)

  let id: string;
  let idToken: Token;
  if (ctx.peek().type !== TokenType.Identifier && ctx.peek().type !== TokenType.StringLiteral) {
    ctx.error("expected-node-id", { kind: start.value });
    id = "__missing_id";
    idToken = start;
  } else {
    idToken = ctx.advance();
    id = idToken.value;
  }

  const tags = parseTags(ctx);
  const { names: annotations, params: annotationParams } = parseAnnotations(ctx);
  const properties: CommonProperties & { label?: string; facets?: string[] } = { links: [] };
  const children: KrsNode[] = [];
  const edges: KrsEdge[] = [];
  let end = idToken;

  if (ctx.peek().type === TokenType.LeftBrace) {
    ctx.advance();
    // Sub-resource nodes (table, queue-item, bucket) are leaf nodes: only properties and
    // edges are allowed inside their bodies. Using a restricted parser avoids accidentally
    // accepting infra keywords (database/queue/storage) as child nodes.
    parseLeafNodeContents(ctx, edges, properties, kind);
    end = ctx.expect(TokenType.RightBrace);
  }

  const base = {
    id,
    label: properties.label,
    tags,
    annotations,
    ...(Object.keys(annotationParams).length > 0 ? { annotationParams } : {}),
    children,
    edges,
    ...(properties.facets && properties.facets.length > 0 ? { facets: properties.facets } : {}),
    loc: ctx.range(start.loc, end.loc),
    properties: {
      description: properties.description,
      links: properties.links,
    },
  };

  return { ...base, kind } as TableNode | QueueItemNode | BucketNode;
}
