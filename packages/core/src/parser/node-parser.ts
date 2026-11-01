import { TokenType, type Token } from "../types/tokens.js";
import type {
  KrsNode,
  KrsEdge,
  HandlesTarget,
  LogicalNodeKind,
  CommonProperties,
  BoundaryBlock,
} from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import { isRecognizedResourceOperation, type CrudVerb } from "../spec/operations.js";
import type { ResourceOperation } from "../spec/operations.js";
import { readNodeIdPathTail } from "./node-path.js";
import { parseTags, parseAnnotations } from "./annotation-parser.js";
import type { ParsedOperation } from "./property-readers.js";
import { parseBlockContentsWithProperties } from "./block-contents.js";
import { parseInfraBlock } from "./infra-parser.js";
import { parseAuthorIdSuffix } from "./edge-parser.js";
import type { ParseContext } from "./parse-context.js";

// Logical node declarations (`system`, `service`, `domain`, `usecase`,
// `entity`, `user`, `client`, `resource`): the id, tags and annotations, then
// the block body. Free functions over the parse context (#3441).

export function parseNodeDecl(ctx: ParseContext): KrsNode {
  const start = ctx.advance(); // keyword
  const kind = start.value as LogicalNodeKind;

  // Delegate infra block parsing to dedicated methods
  if (INFRA_KIND_SET.has(kind)) {
    return parseInfraBlock(ctx, start, kind as "database" | "queue" | "storage");
  }

  // Special handling for resource: support dot-notation reference (resource OrderDB.C)
  if (kind === "resource") {
    return parseResourceDecl(ctx, start);
  }

  // id: accept identifier (e.g. ECommerce) or string literal (e.g. "e-commerce")
  let id: string;
  let idToken: Token;
  if (ctx.peek().type !== TokenType.Identifier && ctx.peek().type !== TokenType.StringLiteral) {
    ctx.error("expected-node-id", { kind });
    id = "__missing_id";
    idToken = start; // fallback location
  } else {
    idToken = ctx.advance();
    id = idToken.value;
  }

  // Optional tags
  const tags = parseTags(ctx);

  // Optional annotations
  const { names: annotations, params: annotationParams } = parseAnnotations(ctx);

  // Properties (label is now a property inside the block)
  const properties: CommonProperties & {
    role?: string;
    team?: string;
    label?: string;
    resources?: import("../types/ast.js").ClientResource[];
    capabilities?: import("../types/ast.js").ClientCapability[];
    handles?: HandlesTarget[];
    delivers?: string[];
    tableRef?: { parent: string; child: string };
    facets?: string[];
  } = {
    links: [],
  };

  // Optional body
  const children: KrsNode[] = [];
  const edges: KrsEdge[] = [];
  const boundaries: BoundaryBlock[] = [];
  let end = idToken;

  if (ctx.peek().type === TokenType.LeftBrace) {
    ctx.advance();
    // service / domain / entity own their edges' origin scope: an explicit
    // edge inside the block must start at the block id (edge-source-mismatch
    // otherwise). For entity this enforces the relation direction rule —
    // origin = the reference-holding entity.
    const parentId = kind === "service" || kind === "domain" || kind === "entity" ? id : undefined;
    parseBlockContentsWithProperties(ctx, children, edges, kind, properties, parentId, boundaries);
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
    // Omitted entirely when none were declared, so nodes in existing models
    // keep their exact shape (snapshot/round-trip stability).
    ...(boundaries.length > 0 ? { boundaries } : {}),
    ...(properties.facets && properties.facets.length > 0 ? { facets: properties.facets } : {}),
    loc: ctx.range(start.loc, end.loc),
  };

  switch (kind) {
    case "system":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
        },
      };
    case "service":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
          ...(properties.handles ? { handles: properties.handles } : {}),
          ...(properties.delivers && properties.delivers.length > 0
            ? { delivers: properties.delivers }
            : {}),
        },
      };
    case "user":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
          role: properties.role,
        },
      };
    case "client":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
          resources: properties.resources ?? [],
          capabilities: properties.capabilities ?? [],
          ...(properties.handles ? { handles: properties.handles } : {}),
        },
      };
    case "domain":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
        },
      };
    case "usecase":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
        },
      };
    case "entity":
      return {
        ...base,
        kind,
        properties: {
          description: properties.description,
          links: properties.links,
        },
        ...(properties.tableRef ? { tableRef: properties.tableRef } : {}),
      };
  }

  // Unreachable: resource and infra blocks are handled above
  ctx.error("invalid-node-kind", { kind });
  return {
    ...base,
    kind: "resource" as const,
    properties: { links: [] },
  };
}

/**
 * Parse `resource` declaration.
 * Supports two forms:
 *   1. Dot-notation reference: `resource OrderDB.C`
 *   2. Inline declaration:     `resource C { label "..." }`
 *      (inline without a database assignment emits an "unassigned-resource" warning)
 */
function parseResourceDecl(ctx: ParseContext, start: Token): KrsNode {
  // id
  let id: string;
  let idToken: Token;
  if (ctx.peek().type !== TokenType.Identifier && ctx.peek().type !== TokenType.StringLiteral) {
    ctx.error("expected-node-id", { kind: "resource" });
    id = "__missing_id";
    idToken = start;
  } else {
    idToken = ctx.advance();
    id = idToken.value;
  }

  // Check for dot-notation: resource OrderDB.C
  let ref: { parent: string; child: string } | undefined;
  if (ctx.peek().type === TokenType.Dot) {
    const tail = readNodeIdPathTail(idToken, ctx, {
      maxSegments: 2,
      acceptStringSegments: true,
    });
    // On a dangling dot, keep this site's historical recovery: report, leave
    // the bad token unconsumed, and still join its value into the id.
    const childToken = tail.dangling ?? tail.end;
    if (tail.dangling) {
      ctx.error("expected-id-or-string", { context: "resource child id" });
    }
    ref = { parent: id, child: childToken.value };
    id = `${id}.${childToken.value}`;
    idToken = childToken;
  }

  const tags = parseTags(ctx);
  const { names: annotations, params: annotationParams } = parseAnnotations(ctx);
  const authorId = parseAuthorIdSuffix(ctx);

  const properties: CommonProperties & {
    label?: string;
    operations?: ParsedOperation[];
    facets?: string[];
  } = {
    links: [],
  };
  const children: KrsNode[] = [];
  const edges: KrsEdge[] = [];
  let end = idToken;

  if (ctx.peek().type === TokenType.LeftBrace) {
    ctx.advance();
    parseBlockContentsWithProperties(ctx, children, edges, "resource", properties);
    end = ctx.expect(TokenType.RightBrace);
  }

  // Inline resources (no dot-notation) that resolve to no store are surfaced
  // by the resolver's `detectUnassignedResources`, not here: a bare
  // `resource Order` may resolve to a unique `entity Order` declared anywhere
  // in the model, which the parser (single-declaration scope) cannot see.
  // Keeping the check model-wide is what makes the zero-edit promotion work
  // (the warning disappears once the matching entity is declared).

  let operations: ResourceOperation[] | undefined;
  if (properties.operations && properties.operations.length > 0) {
    operations = [];
    const seen = new Set<string>();
    for (const op of properties.operations) {
      const opLoc = op.decorationLoc
        ? ctx.range(op.decorationLoc, op.decorationLoc)
        : ctx.range(start.loc, end.loc);

      // De-dupe by verb (matching pre-decoration behavior).
      if (seen.has(op.verb)) {
        ctx.pushDiagnostic({
          severity: "warning",
          code: "duplicate-resource-operation",
          params: { operation: op.verb, resourceId: id },
          loc: opLoc,
        });
        continue;
      }
      seen.add(op.verb);

      let decoratedAs: CrudVerb[] | undefined;
      if (op.decoration === undefined) {
        // Bare verb — current ADR-1046 behavior.
        if (!isRecognizedResourceOperation(op.verb)) {
          ctx.pushDiagnostic({
            severity: "warning",
            code: "unknown-resource-operation",
            params: { operation: op.verb, resourceId: id },
            loc: opLoc,
          });
        }
      } else if (op.decoration.length === 0) {
        ctx.pushDiagnostic({
          severity: "error",
          code: "empty-crud-decoration",
          params: { operation: op.verb, resourceId: id },
          loc: opLoc,
        });
        decoratedAs = [];
      } else {
        decoratedAs = [];
        const seenCrud = new Set<string>();
        for (const item of op.decoration) {
          if (!item.recognized) {
            ctx.pushDiagnostic({
              severity: "error",
              code: "invalid-crud-decoration",
              params: { operation: op.verb, value: item.value, resourceId: id },
              loc: opLoc,
            });
            continue;
          }
          if (seenCrud.has(item.value)) {
            ctx.pushDiagnostic({
              severity: "warning",
              code: "duplicate-crud-decoration-target",
              params: { operation: op.verb, value: item.value, resourceId: id },
              loc: opLoc,
            });
            continue;
          }
          seenCrud.add(item.value);
          decoratedAs.push(item.value as CrudVerb);
        }
      }

      operations.push({
        verb: op.verb,
        ...(decoratedAs !== undefined ? { decoratedAs } : {}),
      });
    }
  }

  return {
    kind: "resource",
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
      ...(operations ? { operations } : {}),
    },
    ref,
    ...(authorId !== undefined ? { authorId } : {}),
  };
}
