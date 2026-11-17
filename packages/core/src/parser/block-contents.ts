import { TokenType, type Token } from "../types/tokens.js";
import type {
  KrsNode,
  KrsEdge,
  HandlesTarget,
  LogicalNodeKind,
  CommonProperties,
  BoundaryBlock,
  ClientResource,
  ClientResourceKind,
} from "../types/ast.js";
import { INFRA_KIND_SET, CLIENT_RESOURCE_KINDS } from "../types/ast.js";
import { KRS_KEYWORD_TOKEN_TYPES } from "../lexer/lexer.js";
import { LOGICAL_CONTAINMENT } from "../builtins/reference-data.js";
import { stitchKebabTail } from "./kebab-name.js";
import { opensEdgeOnLaterLine } from "./node-path.js";
import { consumeRejected, rejectConstruct, rejectEdge, rejectNode } from "./rejected-construct.js";
import { handleNestedLegend } from "./legend-parser.js";
import {
  parseDescriptionValue,
  parseLink,
  parseOperationsList,
  parseHandlesList,
  parseDeliversList,
  readStringValue,
  readTableRef,
  readValueAfter,
  reportMissingValue,
  rejectMisplacedProperty,
  type ParsedOperation,
} from "./property-readers.js";
import { parseBoundaryBlock, parseFacetsList, rejectNestedFacetBlock } from "./org-parser.js";
import { isEdgeStart, parseEdge } from "./edge-parser.js";
import type { ParseContext } from "./parse-context.js";

// The body of a logical node block: its properties, edges and child nodes, the
// blocks nested in it (legend, boundary), and the client-only `resource` and
// `capability` lines. Free functions over the parse context (#3441). A child
// node is read through `ctx.tryParseNodeDecl`, since node-parser.ts imports
// this module.

/**
 * Which kinds may host a scoped `boundary` block (#2036).
 *
 * The rule is "a boundary can be declared wherever a canvas is drawn" — a frame
 * encloses peers on one canvas, so placement and canvas correspond 1:1. Kinds
 * that draw a drill-down canvas (and infra blocks, whose leaf children are drawn
 * as top-level nodes there) can host one; leaves and `entity` (which takes no
 * node children) cannot.
 *
 * Keyed by every {@link LogicalNodeKind} rather than a set literal, so adding a
 * kind fails to typecheck until its placement is decided (TPL-1720).
 */
const BOUNDARY_HOST_KIND = {
  system: true,
  service: true,
  domain: true,
  usecase: true,
  database: true,
  queue: true,
  storage: true,
  entity: false,
  resource: false,
  user: false,
  client: false,
  table: false,
  "queue-item": false,
  bucket: false,
} as const satisfies Record<LogicalNodeKind, boolean>;

export function parseBlockContentsWithProperties(
  ctx: ParseContext,
  children: KrsNode[],
  edges: KrsEdge[],
  kind: LogicalNodeKind,
  properties: CommonProperties & {
    role?: string;
    team?: string;
    label?: string;
    resources?: import("../types/ast.js").ClientResource[];
    capabilities?: import("../types/ast.js").ClientCapability[];
    handles?: HandlesTarget[];
    delivers?: string[];
    operations?: ParsedOperation[];
    tableRef?: { parent: string; child: string };
    facets?: string[];
  },
  parentId?: string,
  /** Collector for scoped `boundary` blocks; omitted by callers whose kind can never host one. */
  boundaries?: BoundaryBlock[],
): void {
  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();

    // Property: label
    if (token.type === TokenType.Label) {
      const value = readStringValue(ctx, ctx.advance(), "label");
      if (value !== undefined) properties.label = value;
      continue;
    }

    // Property: description
    if (token.type === TokenType.Description) {
      properties.description = parseDescriptionValue(ctx, ctx.advance());
      continue;
    }

    // Property: link
    if (token.type === TokenType.Link) {
      const link = parseLink(ctx, ctx.advance());
      if (link) properties.links.push(link);
      continue;
    }

    // Property: facets — cross-cutting membership (#2065 Part B). Accepted on
    // every kind: which facets an element belongs to is imposed from outside
    // the architecture, so no kind is structurally excluded (no
    // `property-not-for-node-kind` branch here, unlike role / handles).
    if (token.type === TokenType.Facets) {
      const keyword = ctx.advance();
      properties.facets ??= [];
      parseFacetsList(ctx, keyword, properties.facets);
      continue;
    }

    // Property: role (user only)
    if (token.type === TokenType.Role) {
      if (kind === "user") {
        const value = readStringValue(ctx, ctx.advance(), "role");
        if (value !== undefined) properties.role = value;
      } else {
        rejectMisplacedProperty(ctx, kind);
      }
      continue;
    }

    // Property: handles (client and service) — domain ids exposed to callers
    if (token.type === TokenType.Handles) {
      if (kind === "client" || kind === "service") {
        const ids = parseHandlesList(ctx, ctx.advance());
        if (ids.length > 0) {
          if (!properties.handles) properties.handles = [];
          properties.handles.push(...ids);
        }
      } else {
        rejectMisplacedProperty(ctx, kind);
      }
      continue;
    }

    // Property: operations (resource only) — CRUD verbs the enclosing usecase
    // performs on this resource. Comma-separated identifiers; multiple
    // `operations` lines accumulate. Optional `verb:c[,c]` decoration maps
    // a non-CRUD verb to its CRUD intent (`list:read`, `replace:create,delete`).
    if (token.type === TokenType.Operations) {
      if (kind === "resource") {
        const ops = parseOperationsList(ctx, ctx.advance());
        if (ops.length > 0) {
          if (!properties.operations) properties.operations = [];
          properties.operations.push(...ops);
        }
      } else {
        rejectMisplacedProperty(ctx, kind);
      }
      continue;
    }

    // Property: table (entity only) — physical mapping `table <InfraId>.<subId>`
    // to an infra sub-resource. Dot notation is required; the bare-id form is
    // reserved. Unlike the infra-leaf `table` block (parsed inside
    // parseInfraBlock), here `table` is a property keyword, so it never
    // collides with infra-block parsing.
    if (token.type === TokenType.Table) {
      if (kind === "entity") {
        const tableRef = readTableRef(ctx, ctx.advance());
        if (tableRef) properties.tableRef = tableRef;
      } else {
        // Read the mapping whole so its `.` and ids are not reported again (#3463).
        const loc = consumeRejected(ctx, (kw) => readTableRef(ctx, kw));
        const params = { blockKind: kind, tokenType: String(token.type), value: token.value };
        rejectConstruct(ctx, loc, "unexpected-token-in-block", params);
      }
      continue;
    }

    // Property: team — removed. Was deprecated (ADR-14); ownership is
    // now declared with an `organization` block + `owns`. The `team` keyword
    // itself stays valid as the organization team-block keyword (parsed elsewhere).
    if (token.type === TokenType.Team) {
      ctx.pushDiagnostic({
        severity: "error",
        code: "team-property-removed",
        params: {},
        loc: ctx.range(token.loc),
      });
      ctx.advance();
      // Consume the value string (if any) so the rest of the block still parses,
      // but not the quoted source of an edge on the next line (#3752).
      if (ctx.peek().type === TokenType.StringLiteral && !opensEdgeOnLaterLine(ctx, token)) {
        ctx.advance();
      }
      continue;
    }

    // Property: delivers (service only). Comma-separated list of client ids.
    if (token.type === TokenType.Delivers) {
      if (kind === "service") {
        const clients = parseDeliversList(ctx, ctx.advance(), kind);
        (properties.delivers ??= []).push(...clients);
      } else {
        rejectMisplacedProperty(ctx, kind);
      }
      continue;
    }

    // Implicit-source edge: -> or --> (source = parent node ID)
    if ((token.type === TokenType.Arrow || token.type === TokenType.DashedArrow) && parentId) {
      const edge = parseEdge(ctx, parentId);
      if (edge) edges.push(edge);
      continue;
    }

    // Check for edge: Identifier/StringLiteral -> or -->
    if (isEdgeStart(ctx, token)) {
      const edge = parseEdge(ctx);
      if (!edge) continue;
      if (parentId && edge.from !== parentId) {
        ctx.pushDiagnostic({
          severity: "error",
          code: "edge-source-mismatch",
          params: { from: edge.from, parentId },
          loc: edge.loc,
        });
      }
      edges.push(edge);
      continue;
    }

    // Client-only: `resource <storageKind> [<Id>] "<name>"` declares operation-tied
    // storage (#3794 added the id). Read as this form when the word after
    // `resource` is a storage kind, or, for a misspelt kind, when a name follows
    // it (directly or after an id), so the kind is still reported as such.
    // Anything else stays a regular resource declaration, rejected in a client.
    if (
      kind === "client" &&
      token.type === TokenType.Resource &&
      ctx.peekAt(1).type === TokenType.Identifier &&
      (isClientResourceKind(ctx.peekAt(1).value) ||
        ctx.peekAt(2).type === TokenType.StringLiteral ||
        (ctx.peekAt(2).type === TokenType.Identifier &&
          ctx.peekAt(3).type === TokenType.StringLiteral))
    ) {
      properties.resources ??= [];
      properties.resources.push(parseClientResource(ctx));
      continue;
    }

    // Client-only: `capability <name>` or `capability <name> { label "..." description "..." }`.
    // Identifier set is open by design — see ADR-837.
    if (kind === "client" && token.type === TokenType.Capability) {
      properties.capabilities ??= [];
      properties.capabilities.push(parseClientCapability(ctx));
      continue;
    }

    // Check for logical node. The declaration is read through the context:
    // node-parser.ts imports this module, so importing it back would form a
    // cycle (#3441).
    const node = ctx.tryParseNodeDecl();
    if (node) {
      // Infra block kinds (database/queue/storage) are only valid as direct
      // children of system, and `entity` only as a `domain` child. The whole
      // declaration was consumed for clean error recovery; drop it.
      const infra = INFRA_KIND_SET.has(token.value);
      if ((infra && kind !== "system") || (token.value === "entity" && kind !== "domain")) {
        rejectNode(ctx, node, kind);
        continue;
      }
      // An `entity` block accepts no node children — only relations, a
      // `table` mapping, and label / description (the "no attributes"
      // invariant, TPL-1882). Reject and drop any nested logical
      // node (usecase / resource / …) instead of silently attaching it.
      if (kind === "entity") {
        const params = { blockKind: "entity", tokenType: String(token.type), value: token.value };
        rejectConstruct(ctx, node.loc, "unexpected-token-in-block", params);
        continue;
      }
      // Nesting placement (#2165). `canContain` is the single definition of
      // which children a kind may hold; anything outside it carries no
      // defined semantics (`docs/concepts.ja.md` fixes the hierarchy as
      // service → domain → usecase → resource). `.krs language v2.0` rejects
      // such a nesting (#2924): an error, and the node is kept out of the
      // model with its subtree. It was parsed whole above, so the block after it still
      // parses, and a reference to it falls to the unresolved-reference
      // warnings (spec §S6) rather than to a second error.
      if (!LOGICAL_CONTAINMENT.get(kind)?.has(node.kind)) {
        const params = { childKind: node.kind, parentKind: kind };
        rejectConstruct(ctx, node.loc, "node-not-in-context", params);
        continue;
      }
      children.push(node);
      continue;
    }

    if (token.type === TokenType.Legend) {
      handleNestedLegend(ctx, kind);
      continue;
    }

    if (token.type === TokenType.Facet) {
      rejectNestedFacetBlock(ctx, kind);
      continue;
    }

    // A `boundary` block declared inside a node block (#2036). Parse it first
    // either way, so a misplaced one is consumed whole and recovery is clean
    // (same shape as the `entity-not-in-domain` branch above).
    if (token.type === TokenType.Boundary) {
      const block = parseBoundaryBlock(ctx);
      if (BOUNDARY_HOST_KIND[kind] && boundaries) {
        boundaries.push(block);
      } else {
        rejectConstruct(ctx, block.loc, "boundary-not-in-context", { parentKind: kind });
      }
      continue;
    }

    ctx.error("unexpected-token-in-block", {
      blockKind: "",
      tokenType: String(token.type),
      value: token.value,
    });
    ctx.advance();
  }
}

function isClientResourceKind(value: string): value is ClientResourceKind {
  return (CLIENT_RESOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * `resource <storageKind> [<Id>] "<name>"`, the `resource` keyword not yet
 * consumed. The id is optional (#3794) and may be quoted; the name is required and read with the
 * shared reader, so a string on a later line that opens an edge
 * (`"WebApp" -> A`) is left as that edge's source and the missing name is
 * reported (ADR-3752, TPL-3752). A name on a later line that opens nothing is
 * still the name, as it was before the id existed.
 */
function parseClientResource(ctx: ParseContext): ClientResource {
  const start = ctx.expect(TokenType.Resource);
  const kindToken = ctx.expect(TokenType.Identifier);
  const kindName = kindToken.value;
  let last: Token = kindToken;

  let id: string | undefined;
  const idToken = ctx.peek();
  if (idToken.type === TokenType.Identifier && !opensEdgeOnLaterLine(ctx, last)) {
    id = ctx.advance().value;
    last = idToken;
  } else if (
    // A quoted id (`resource opfs "api-key" "…"`), the spelling the formatter
    // prints for an id no bare word can hold (TPL-2707). Only when the name
    // follows on the same line: a lone string is the name, as it always was.
    idToken.type === TokenType.StringLiteral &&
    ctx.peekAt(1).type === TokenType.StringLiteral &&
    ctx.peekAt(1).loc.line === endLineOf(idToken) &&
    !opensEdgeOnLaterLine(ctx, last)
  ) {
    id = ctx.advance().value;
    last = idToken;
  } else if (KRS_KEYWORD_TOKEN_TYPES.has(idToken.type) && idToken.loc.line === endLineOf(last)) {
    // A word the lexer reads as a keyword (`table`, `storage`, …) cannot be an
    // id. Consumed, so the name after it is still read.
    ctx.error("expected-identifier", { got: String(idToken.type), value: idToken.value });
    ctx.advance();
    last = idToken;
  }

  const nameToken = readValueAfter(ctx, last, TokenType.StringLiteral);
  if (!nameToken) {
    reportMissingValue(ctx, start.loc, "expected-string-after", { property: "resource" });
  } else {
    last = nameToken;
  }
  const loc = ctx.range(start.loc, last.end ?? last.loc);

  if (!isClientResourceKind(kindName)) {
    ctx.pushDiagnostic({
      severity: "error",
      code: "client-resource-invalid-kind",
      params: { kind: kindName, name: nameToken?.value ?? "" },
      loc,
    });
  }
  return {
    storageKind: kindName as ClientResourceKind,
    ...(id !== undefined ? { id } : {}),
    name: nameToken?.value ?? "",
    loc,
  };
}

/** The line a token ends on (a string literal may span lines). */
function endLineOf(token: Token): number {
  return (token.end ?? token.loc).line;
}

function parseClientCapability(ctx: ParseContext): import("../types/ast.js").ClientCapability {
  const start = ctx.expect(TokenType.Capability);
  const nameToken = ctx.expect(TokenType.Identifier);
  // Capability identifiers are kebab-case by convention (e.g. screen-wake-lock,
  // face-id). Stitch the `<word> - <word>` token run back into one name —
  // shared with tags / annotations / legend refs (#2509, kebab-name.ts).
  const stitched = stitchKebabTail(nameToken, ctx);
  const name = stitched.name;
  let end: Token = stitched.end;
  let label: string | undefined;
  let description: string | undefined;

  if (ctx.peek().type === TokenType.LeftBrace) {
    ctx.advance();
    while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
      const inner = ctx.peek();
      if (inner.type === TokenType.Label) {
        const value = readStringValue(ctx, ctx.advance(), "label");
        if (value !== undefined) label = value;
        continue;
      }
      if (inner.type === TokenType.Description) {
        description = parseDescriptionValue(ctx, ctx.advance());
        continue;
      }
      if (rejectEdge(ctx, "capability")) continue;
      ctx.error("unexpected-token-in-block", {
        blockKind: "capability",
        tokenType: String(inner.type),
        value: inner.value,
      });
      ctx.advance();
    }
    end = ctx.expect(TokenType.RightBrace);
  }

  return {
    name,
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    loc: ctx.range(start.loc, end.loc),
  };
}
