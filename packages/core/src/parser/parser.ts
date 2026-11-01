import { TokenType, type Token, type SourceRange, type SourceLocation } from "../types/tokens.js";
import { stitchKebabTail } from "./kebab-name.js";
import { readNodeIdPathTail } from "./node-path.js";
import type {
  KrsFile,
  KrsNode,
  KrsEdge,
  LinkEntry,
  HandlesTarget,
  ImportDeclaration,
  ImportEntry,
  NodeIdPath,
  Diagnostic,
  DiagnosticCode,
  DiagnosticParamsByCode,
  ParseResult,
  LogicalNodeKind,
  DomainNode,
  ServiceNode,
  ClientNode,
  CommonProperties,
  BoundaryBlock,
  TableNode,
  QueueItemNode,
  BucketNode,
  DatabaseNode,
  QueueGroupNode,
  StorageNode,
} from "../types/ast.js";
import { INFRA_KIND_SET, createEmptyKrsFile } from "../types/ast.js";
import { rejectConstruct, rejectProperty } from "./rejected-construct.js";
import { LOGICAL_CONTAINMENT } from "../builtins/reference-data.js";
import { Lexer } from "../lexer/lexer.js";
import { isRecognizedResourceOperation, type CrudVerb } from "../spec/operations.js";
import type { ResourceOperation } from "../spec/operations.js";
import { LOGICAL_KEYWORDS } from "./parser-keywords.js";
import { handleNestedLegend, parseLegendBlock } from "./legend-parser.js";
import { parseTags, parseAnnotations } from "./annotation-parser.js";
import {
  parseDescriptionValue,
  parseLink,
  parseIdOrString,
  commaSeparatedValues,
  parseOperationsList,
  parseHandlesList,
  type ParsedOperation,
} from "./property-readers.js";
import {
  parseOrganizationBlock,
  parseBoundaryBlock,
  parseFacetBlock,
  parseFacetsList,
  rejectNestedFacetBlock,
} from "./org-parser.js";
import { parseDeployBlock } from "./deploy-parser.js";
import { finalizeFile } from "./finalize-file.js";
import type { ParseContext } from "./parse-context.js";

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

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private diagnostics: Diagnostic[] = [];

  /**
   * The parser's primitives as one object, for the parsing functions that live
   * in other modules (see parse-context.ts). Built once here rather than per
   * call: the LSP re-parses on every keystroke.
   */
  private readonly ctx: ParseContext = {
    peek: () => this.peek(),
    peekAt: (offset) => this.peekAt(offset),
    advance: () => this.advance(),
    expect: (type) => this.expect(type),
    match: (type) => this.match(type),
    error: (code, params) => this.error(code, params),
    range: (start, end) => this.range(start, end),
    pushDiagnostic: (...diagnostics) => this.diagnostics.push(...diagnostics),
    previous: () => this.tokens[this.pos - 1],
    discardDiagnostics: (parse) => {
      const before = this.diagnostics.length;
      const result = parse();
      this.diagnostics.length = before;
      return result;
    },
  };

  /**
   * Stamped onto every range the parser builds; see {@link SourceRange.file}.
   * Trivia ranges come from the lexer and carry none: nothing anchors a
   * diagnostic on a comment.
   */
  private readonly filePath: string | undefined;

  constructor(tokens: Token[], filePath?: string) {
    this.tokens = tokens;
    this.filePath = filePath;
  }

  /**
   * @param filePath The document's absolute path, when known. Every `loc` the
   *   parse produces (on nodes and on diagnostics alike) then carries it, so
   *   a diagnostic re-derived on a merged model still names its file.
   */
  static parse(source: string, filePath?: string): ParseResult<KrsFile> {
    const tokens = new Lexer(source).tokenize();
    const parser = new Parser(tokens, filePath);
    return parser.parseFile();
  }

  private peek(): Token {
    return (
      this.tokens[this.pos] ?? {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, column: 0, offset: 0 },
      }
    );
  }

  private peekAt(offset: number): Token {
    return (
      this.tokens[this.pos + offset] ?? {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, column: 0, offset: 0 },
      }
    );
  }

  private advance(): Token {
    const token = this.peek();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      this.error("token-type-mismatch", {
        expected: String(type),
        got: String(token.type),
        value: token.value,
      });
      return token;
    }
    return this.advance();
  }

  private match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private error<K extends DiagnosticCode>(code: K, params: DiagnosticParamsByCode[K]): void {
    this.diagnostics.push({
      severity: "error",
      code,
      params,
      loc: this.range(this.peek().loc),
    } as Diagnostic);
  }

  /**
   * The only place a `.krs` {@link SourceRange} is built, which is why the
   * file identity is attached here and nowhere else: every node and diagnostic
   * inherits it without its author doing anything (TPL-2715). The key is
   * omitted rather than set to `undefined` when no path was given.
   *
   * Assigned rather than spread in: this runs for every node, edge, property
   * and diagnostic on each re-parse, and a spread allocates a throwaway object
   * per call.
   */
  private range(start: Token["loc"], end?: Token["loc"]): SourceRange {
    const range: SourceRange = {
      start: { ...start },
      end: end ? { ...end } : { ...start },
    };
    if (this.filePath !== undefined) range.file = this.filePath;
    return range;
  }

  parseFile(): ParseResult<KrsFile> {
    const file: KrsFile = createEmptyKrsFile();

    while (this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      switch (token.type) {
        case TokenType.AtImport:
          file.styleImports.push(this.parseStyleImport());
          break;
        case TokenType.Import:
          file.nodeImports.push(this.parseNodeImport());
          break;
        case TokenType.System:
          file.systems.push(this.parseSystemBlock());
          break;
        case TokenType.Service:
          file.services.push(this.parseNodeDecl() as ServiceNode);
          break;
        case TokenType.Client:
          file.clients.push(this.parseNodeDecl() as ClientNode);
          break;
        case TokenType.Domain:
          file.domains.push(this.parseNodeDecl() as DomainNode);
          break;
        case TokenType.Database:
          file.databases.push(this.parseInfraBlock(this.advance(), "database") as DatabaseNode);
          break;
        case TokenType.Queue:
          file.queues.push(this.parseInfraBlock(this.advance(), "queue") as QueueGroupNode);
          break;
        case TokenType.Storage:
          file.storages.push(this.parseInfraBlock(this.advance(), "storage") as StorageNode);
          break;
        case TokenType.Deploy:
          file.deploys.push(parseDeployBlock(this.ctx));
          break;
        case TokenType.Organization:
          file.organizations.push(parseOrganizationBlock(this.ctx));
          break;
        case TokenType.Boundary:
          file.boundaries.push(parseBoundaryBlock(this.ctx));
          break;
        case TokenType.Facet:
          file.facets.push(parseFacetBlock(this.ctx));
          break;
        case TokenType.Legend:
          file.legends.push(parseLegendBlock(this.ctx));
          break;
        case TokenType.User:
          // A `user` is only valid inside a `system`. Report it with a
          // dedicated code (not a generic unexpected-token) and consume the
          // declaration so parsing recovers cleanly.
          this.error("top-level-declaration", { construct: "user" });
          this.parseNodeDecl();
          break;
        case TokenType.Entity: {
          // An `entity` is only valid as a `domain` child. Consume the whole
          // declaration and emit the dedicated diagnostic (not the generic
          // unexpected-token cascade) so the canonical mistake reads clearly.
          const stray = this.parseNodeDecl();
          this.diagnostics.push({
            severity: "error",
            code: "entity-not-in-domain",
            params: { parentKind: "top level" },
            loc: stray.loc,
          });
          break;
        }
        default:
          // A top-level edge (`A -> B`) is likewise only valid inside a
          // `system`; surface the same dedicated diagnostic and consume it.
          if (this.isEdgeStart(token)) {
            this.error("top-level-declaration", { construct: "edge" });
            this.parseEdge();
            break;
          }
          this.error("unexpected-token-root", {
            tokenType: String(token.type),
            value: token.value,
          });
          this.advance();
      }
    }

    finalizeFile(this.ctx, file);

    return { value: file, diagnostics: this.diagnostics };
  }

  private parseStyleImport(): string {
    this.advance(); // @import
    const path = this.expect(TokenType.StringLiteral);
    return path.value;
  }

  private parseNodeImport(): ImportDeclaration {
    const start = this.advance(); // import

    // Wildcard import: import "file.krs"
    if (this.peek().type === TokenType.StringLiteral) {
      const path = this.advance();
      return { ids: [], path: path.value, loc: this.range(start.loc, path.loc) };
    }

    if (this.peek().type !== TokenType.LeftBrace) {
      this.error("expected-brace-or-string", {
        got: String(this.peek().type),
        value: this.peek().value,
      });
      // LeftBrace がない場合は空の import 宣言を返す
      return { ids: [], path: "", loc: this.range(start.loc) };
    }
    this.advance(); // {

    const ids: ImportEntry[] = [];
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.Identifier) {
        // Read one path: Identifier (Dot Identifier)*
        const first = this.advance();
        const tail = readNodeIdPathTail(first, this.ctx);
        if (tail.dangling) {
          // dot without trailing identifier — record error and stop reading
          // segments for this entry; skip the bad token to make progress.
          this.error("expected-identifier", {
            got: String(tail.dangling.type),
            value: tail.dangling.value,
          });
          this.advance();
        }
        // The entry's own range, so a resolution diagnostic can point at the
        // one entry of `import { A, B.C }` that failed (#2582 review).
        const last = tail.dangling ?? tail.end;
        ids.push({ path: tail.segments, loc: this.range(first.loc, last.end ?? last.loc) });
        this.match(TokenType.Comma);
      } else {
        // 予期しないトークン: エラーを記録してスキップ
        this.error("expected-identifier", {
          got: String(this.peek().type),
          value: this.peek().value,
        });
        this.advance();
      }
    }
    this.expect(TokenType.RightBrace);
    this.expect(TokenType.From);
    const path = this.expect(TokenType.StringLiteral);

    return {
      ids,
      path: path.value,
      loc: this.range(start.loc, path.loc),
    };
  }

  private parseSystemBlock(): import("../types/ast.js").SystemNode {
    return this.parseNodeDecl() as import("../types/ast.js").SystemNode;
  }

  private parseBlockContentsWithProperties(
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
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      // Property: label
      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
        continue;
      }

      // Property: description
      if (token.type === TokenType.Description) {
        this.advance();
        properties.description = parseDescriptionValue(this.ctx);
        continue;
      }

      // Property: link
      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(parseLink(this.ctx));
        continue;
      }

      // Property: facets — cross-cutting membership (#2065 Part B). Accepted on
      // every kind: which facets an element belongs to is imposed from outside
      // the architecture, so no kind is structurally excluded (no
      // `property-not-for-node-kind` branch here, unlike role / handles).
      if (token.type === TokenType.Facets) {
        const keyword = this.advance();
        properties.facets ??= [];
        parseFacetsList(this.ctx, keyword, properties.facets);
        continue;
      }

      // Property: role (user only)
      if (token.type === TokenType.Role) {
        if (kind === "user") {
          this.advance();
          if (this.peek().type === TokenType.StringLiteral) {
            properties.role = this.advance().value;
          } else {
            this.error("expected-string-after", { property: "role" });
          }
        } else {
          // A bare `role` must not take the source of an edge on the next line.
          rejectProperty(this.ctx, "role", kind, () => {
            if (!this.isEdgeStart(this.peek())) this.match(TokenType.StringLiteral);
          });
        }
        continue;
      }

      // Property: handles (client and service) — domain ids exposed to callers
      if (token.type === TokenType.Handles) {
        if (kind === "client" || kind === "service") {
          const ids = parseHandlesList(this.ctx, this.advance());
          if (ids.length > 0) {
            if (!properties.handles) properties.handles = [];
            properties.handles.push(...ids);
          }
        } else {
          rejectProperty(this.ctx, "handles", kind, (keyword) =>
            parseHandlesList(this.ctx, keyword),
          );
        }
        continue;
      }

      // Property: operations (resource only) — CRUD verbs the enclosing usecase
      // performs on this resource. Comma-separated identifiers; multiple
      // `operations` lines accumulate. Optional `verb:c[,c]` decoration maps
      // a non-CRUD verb to its CRUD intent (`list:read`, `replace:create,delete`).
      if (token.type === TokenType.Operations) {
        if (kind === "resource") {
          const ops = parseOperationsList(this.ctx, this.advance());
          if (ops.length > 0) {
            if (!properties.operations) properties.operations = [];
            properties.operations.push(...ops);
          }
        } else {
          rejectProperty(this.ctx, "operations", kind, (keyword) =>
            parseOperationsList(this.ctx, keyword),
          );
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
          this.advance();
          // Require the full `<InfraId>.<subId>` form. Guard BOTH sides so a
          // malformed mapping (`table .orders`, `table OrderDB.`, `table orders`)
          // leaves tableRef undefined, emits exactly one diagnostic, and never
          // consumes a stray token (`.`, `}`) as an id.
          const isId = (t: TokenType) =>
            t === TokenType.Identifier || t === TokenType.StringLiteral;
          if (isId(this.peek().type)) {
            const tail = readNodeIdPathTail(this.advance(), this.ctx, {
              maxSegments: 2,
              acceptStringSegments: true,
            });
            if (tail.segments.length === 2) {
              properties.tableRef = { parent: tail.segments[0], child: tail.segments[1] };
            } else {
              // Missing dot, or missing sub-id after the dot — do NOT consume
              // the following token (`}`, etc.).
              this.error("expected-id-after", { property: "table" });
            }
          } else {
            this.error("expected-id-or-string", { context: "entity table infra id" });
            // Consume a stray `.<id>` so we recover in one diagnostic, not three.
            if (this.peek().type === TokenType.Dot) {
              this.advance();
              if (isId(this.peek().type)) this.advance();
            }
          }
        } else {
          this.error("unexpected-token-in-block", {
            blockKind: kind,
            tokenType: String(token.type),
            value: token.value,
          });
          this.advance();
        }
        continue;
      }

      // Property: team — removed. Was deprecated (ADR-14); ownership is
      // now declared with an `organization` block + `owns`. The `team` keyword
      // itself stays valid as the organization team-block keyword (parsed elsewhere).
      if (token.type === TokenType.Team) {
        this.diagnostics.push({
          severity: "error",
          code: "team-property-removed",
          params: {},
          loc: this.range(token.loc),
        });
        this.advance();
        // Consume the value string (if any) so the rest of the block still parses.
        if (this.peek().type === TokenType.StringLiteral) {
          this.advance();
        }
        continue;
      }

      // Property: delivers (service only). Comma-separated list of client ids.
      if (token.type === TokenType.Delivers) {
        if (kind === "service") {
          const keyword = this.advance();
          for (const client of commaSeparatedValues(this.ctx, keyword, "delivers")) {
            (properties.delivers ??= []).push(client.value);
          }
        } else {
          rejectProperty(this.ctx, "delivers", kind, (keyword) => [
            ...commaSeparatedValues(this.ctx, keyword, "delivers"),
          ]);
        }
        continue;
      }

      // Implicit-source edge: -> or --> (source = parent node ID)
      if ((token.type === TokenType.Arrow || token.type === TokenType.DashedArrow) && parentId) {
        edges.push(this.parseEdge(parentId));
        continue;
      }

      // Check for edge: Identifier/StringLiteral -> or -->
      if (this.isEdgeStart(token)) {
        const edge = this.parseEdge();
        if (parentId && edge.from !== parentId) {
          this.diagnostics.push({
            severity: "error",
            code: "edge-source-mismatch",
            params: { from: edge.from, parentId },
            loc: edge.loc,
          });
        }
        edges.push(edge);
        continue;
      }

      // Client-only: `resource <storageKind> "<name>"` declares operation-tied storage.
      // Distinguished from a regular resource declaration by the trailing string literal.
      if (
        kind === "client" &&
        token.type === TokenType.Resource &&
        this.peekAt(1).type === TokenType.Identifier &&
        this.peekAt(2).type === TokenType.StringLiteral
      ) {
        properties.resources ??= [];
        properties.resources.push(this.parseClientResource());
        continue;
      }

      // Client-only: `capability <name>` or `capability <name> { label "..." description "..." }`.
      // Identifier set is open by design — see ADR-837.
      if (kind === "client" && token.type === TokenType.Capability) {
        properties.capabilities ??= [];
        properties.capabilities.push(this.parseClientCapability());
        continue;
      }

      // Check for logical node
      if (this.isLogicalKeyword(token)) {
        // Infra block kinds (database/queue/storage) are only valid as direct
        // children of system. Consume the whole block for clean error
        // recovery, then drop it (same shape as `entity` below).
        if (INFRA_KIND_SET.has(token.value) && kind !== "system") {
          const params = { infraKind: token.value, parentKind: kind };
          rejectConstruct(this.ctx, this.parseNodeDecl().loc, "infra-not-in-context", params);
          continue;
        }
        // `entity` is only valid as a `domain` child. Consume the full
        // declaration for clean error recovery, then drop it.
        if (token.value === "entity" && kind !== "domain") {
          const node = this.parseNodeDecl();
          rejectConstruct(this.ctx, node.loc, "entity-not-in-domain", { parentKind: kind });
          continue;
        }
        // An `entity` block accepts no node children — only relations, a
        // `table` mapping, and label / description (the "no attributes"
        // invariant, TPL-1882). Reject and drop any nested logical
        // node (usecase / resource / …) instead of silently attaching it.
        if (kind === "entity") {
          const node = this.parseNodeDecl();
          const params = { blockKind: "entity", tokenType: String(token.type), value: token.value };
          rejectConstruct(this.ctx, node.loc, "unexpected-token-in-block", params);
          continue;
        }
        const child = this.parseNodeDecl();
        // Nesting placement (#2165). `canContain` is the single definition of
        // which children a kind may hold; anything outside it carries no
        // defined semantics (`docs/concepts.ja.md` fixes the hierarchy as
        // service → domain → usecase → resource). `.krs language v2.0` rejects
        // such a nesting (#2924): an error, and the node is kept out of the
        // model with its subtree. It was parsed whole above, so the block after it still
        // parses, and a reference to it falls to the unresolved-reference
        // warnings (spec §S6) rather than to a second error.
        if (!LOGICAL_CONTAINMENT.get(kind)?.has(child.kind)) {
          const params = { childKind: child.kind, parentKind: kind };
          rejectConstruct(this.ctx, child.loc, "node-not-in-context", params);
          continue;
        }
        children.push(child);
        continue;
      }

      if (token.type === TokenType.Legend) {
        handleNestedLegend(this.ctx, kind);
        continue;
      }

      if (token.type === TokenType.Facet) {
        rejectNestedFacetBlock(this.ctx, kind);
        continue;
      }

      // A `boundary` block declared inside a node block (#2036). Parse it first
      // either way, so a misplaced one is consumed whole and recovery is clean
      // (same shape as the `entity-not-in-domain` branch above).
      if (token.type === TokenType.Boundary) {
        const block = parseBoundaryBlock(this.ctx);
        if (BOUNDARY_HOST_KIND[kind] && boundaries) {
          boundaries.push(block);
        } else {
          rejectConstruct(this.ctx, block.loc, "boundary-not-in-context", { parentKind: kind });
        }
        continue;
      }

      this.error("unexpected-token-in-block", {
        blockKind: "",
        tokenType: String(token.type),
        value: token.value,
      });
      this.advance();
    }
  }

  private parseClientResource(): import("../types/ast.js").ClientResource {
    const start = this.expect(TokenType.Resource);
    const kindToken = this.expect(TokenType.Identifier);
    const nameToken = this.expect(TokenType.StringLiteral);
    const kindName = kindToken.value;
    const isAllowed = (
      ["localStorage", "sessionStorage", "indexedDB", "opfs", "file", "keychain"] as const
    ).some((k) => k === kindName);
    if (!isAllowed) {
      this.diagnostics.push({
        severity: "error",
        code: "client-resource-invalid-kind",
        params: { kind: kindName, name: nameToken.value },
        loc: this.range(start.loc, nameToken.loc),
      });
    }
    return {
      storageKind: kindName as import("../types/ast.js").ClientResourceKind,
      name: nameToken.value,
      loc: this.range(start.loc, nameToken.loc),
    };
  }

  private parseClientCapability(): import("../types/ast.js").ClientCapability {
    const start = this.expect(TokenType.Capability);
    const nameToken = this.expect(TokenType.Identifier);
    // Capability identifiers are kebab-case by convention (e.g. screen-wake-lock,
    // face-id). Stitch the `<word> - <word>` token run back into one name —
    // shared with tags / annotations / legend refs (#2509, kebab-name.ts).
    const stitched = stitchKebabTail(nameToken, this.ctx);
    const name = stitched.name;
    let end: Token = stitched.end;
    let label: string | undefined;
    let description: string | undefined;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
        const inner = this.peek();
        if (inner.type === TokenType.Label) {
          this.advance();
          if (this.peek().type === TokenType.StringLiteral) {
            label = this.advance().value;
          } else {
            this.error("expected-string-after", { property: "label" });
          }
          continue;
        }
        if (inner.type === TokenType.Description) {
          this.advance();
          description = parseDescriptionValue(this.ctx);
          continue;
        }
        this.error("unexpected-token-in-block", {
          blockKind: "capability",
          tokenType: String(inner.type),
          value: inner.value,
        });
        this.advance();
      }
      end = this.expect(TokenType.RightBrace);
    }

    return {
      name,
      ...(label !== undefined ? { label } : {}),
      ...(description !== undefined ? { description } : {}),
      loc: this.range(start.loc, end.loc),
    };
  }

  private isLogicalKeyword(token: Token): boolean {
    return LOGICAL_KEYWORDS.has(token.value) && this.isNodeKeywordType(token.type);
  }

  /**
   * True when `token` (the current token) begins an explicit edge: an
   * identifier or string literal followed by `->` (sync) or `-->` (async).
   */
  private isEdgeStart(token: Token): boolean {
    return (
      (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
      (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
    );
  }

  private isNodeKeywordType(type: TokenType): boolean {
    return (
      type === TokenType.System ||
      type === TokenType.Service ||
      type === TokenType.Domain ||
      type === TokenType.Usecase ||
      type === TokenType.Entity ||
      type === TokenType.Resource ||
      type === TokenType.User ||
      type === TokenType.Client ||
      type === TokenType.Database ||
      type === TokenType.Queue ||
      type === TokenType.Storage
    );
  }

  private parseNodeDecl(): KrsNode {
    const start = this.advance(); // keyword
    const kind = start.value as LogicalNodeKind;

    // Delegate infra block parsing to dedicated methods
    if (INFRA_KIND_SET.has(kind)) {
      return this.parseInfraBlock(start, kind as "database" | "queue" | "storage");
    }

    // Special handling for resource: support dot-notation reference (resource OrderDB.C)
    if (kind === "resource") {
      return this.parseResourceDecl(start);
    }

    // id: accept identifier (e.g. ECommerce) or string literal (e.g. "e-commerce")
    let id: string;
    let idToken: Token;
    if (this.peek().type !== TokenType.Identifier && this.peek().type !== TokenType.StringLiteral) {
      this.error("expected-node-id", { kind });
      id = "__missing_id";
      idToken = start; // fallback location
    } else {
      idToken = this.advance();
      id = idToken.value;
    }

    // Optional tags
    const tags = parseTags(this.ctx);

    // Optional annotations
    const { names: annotations, params: annotationParams } = parseAnnotations(this.ctx);

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

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      // service / domain / entity own their edges' origin scope: an explicit
      // edge inside the block must start at the block id (edge-source-mismatch
      // otherwise). For entity this enforces the relation direction rule —
      // origin = the reference-holding entity.
      const parentId =
        kind === "service" || kind === "domain" || kind === "entity" ? id : undefined;
      this.parseBlockContentsWithProperties(
        children,
        edges,
        kind,
        properties,
        parentId,
        boundaries,
      );
      end = this.expect(TokenType.RightBrace);
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
      loc: this.range(start.loc, end.loc),
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
    this.error("invalid-node-kind", { kind });
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
  private parseResourceDecl(start: Token): KrsNode {
    // id
    let id: string;
    let idToken: Token;
    if (this.peek().type !== TokenType.Identifier && this.peek().type !== TokenType.StringLiteral) {
      this.error("expected-node-id", { kind: "resource" });
      id = "__missing_id";
      idToken = start;
    } else {
      idToken = this.advance();
      id = idToken.value;
    }

    // Check for dot-notation: resource OrderDB.C
    let ref: { parent: string; child: string } | undefined;
    if (this.peek().type === TokenType.Dot) {
      const tail = readNodeIdPathTail(idToken, this.ctx, {
        maxSegments: 2,
        acceptStringSegments: true,
      });
      // On a dangling dot, keep this site's historical recovery: report, leave
      // the bad token unconsumed, and still join its value into the id.
      const childToken = tail.dangling ?? tail.end;
      if (tail.dangling) {
        this.error("expected-id-or-string", { context: "resource child id" });
      }
      ref = { parent: id, child: childToken.value };
      id = `${id}.${childToken.value}`;
      idToken = childToken;
    }

    const tags = parseTags(this.ctx);
    const { names: annotations, params: annotationParams } = parseAnnotations(this.ctx);
    const authorId = this.parseAuthorIdSuffix();

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

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseBlockContentsWithProperties(children, edges, "resource", properties);
      end = this.expect(TokenType.RightBrace);
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
          ? this.range(op.decorationLoc, op.decorationLoc)
          : this.range(start.loc, end.loc);

        // De-dupe by verb (matching pre-decoration behavior).
        if (seen.has(op.verb)) {
          this.diagnostics.push({
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
            this.diagnostics.push({
              severity: "warning",
              code: "unknown-resource-operation",
              params: { operation: op.verb, resourceId: id },
              loc: opLoc,
            });
          }
        } else if (op.decoration.length === 0) {
          this.diagnostics.push({
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
              this.diagnostics.push({
                severity: "error",
                code: "invalid-crud-decoration",
                params: { operation: op.verb, value: item.value, resourceId: id },
                loc: opLoc,
              });
              continue;
            }
            if (seenCrud.has(item.value)) {
              this.diagnostics.push({
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
      loc: this.range(start.loc, end.loc),
      properties: {
        description: properties.description,
        links: properties.links,
        ...(operations ? { operations } : {}),
      },
      ref,
      ...(authorId !== undefined ? { authorId } : {}),
    };
  }

  /**
   * Parse a top-level infra block: `database`, `queue`, or `storage`.
   * Each has a body of sub-resource declarations:
   *   database → table
   *   queue    → queue (parsed as queue-item internally)
   *   storage  → bucket
   */
  private parseInfraBlock(start: Token, kind: "database" | "queue" | "storage"): KrsNode {
    let id: string;
    let idToken: Token;
    if (this.peek().type !== TokenType.Identifier && this.peek().type !== TokenType.StringLiteral) {
      this.error("expected-node-id", { kind });
      id = "__missing_id";
      idToken = start;
    } else {
      idToken = this.advance();
      id = idToken.value;
    }

    const tags = parseTags(this.ctx);
    const { names: annotations, params: annotationParams } = parseAnnotations(this.ctx);
    const properties: CommonProperties & { label?: string; facets?: string[] } = { links: [] };
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    const boundaries: BoundaryBlock[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseInfraBlockContents(children, edges, kind, properties, boundaries);
      end = this.expect(TokenType.RightBrace);
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
      loc: this.range(start.loc, end.loc),
      properties: {
        description: properties.description,
        links: properties.links,
      },
    };

    return { ...base, kind };
  }

  /** Parse the body of a database/queue/storage block. */
  private parseInfraBlockContents(
    children: KrsNode[],
    edges: KrsEdge[],
    parentKind: "database" | "queue" | "storage",
    properties: CommonProperties & { label?: string; facets?: string[] },
    boundaries: BoundaryBlock[],
  ): void {
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
        continue;
      }

      if (token.type === TokenType.Description) {
        this.advance();
        properties.description = parseDescriptionValue(this.ctx);
        continue;
      }

      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(parseLink(this.ctx));
        continue;
      }

      // Edge
      if (this.isEdgeStart(token)) {
        edges.push(this.parseEdge());
        continue;
      }

      // Sub-resource declarations
      const subNode = this.tryParseInfraSubNode(parentKind);
      if (subNode) {
        children.push(subNode);
        continue;
      }

      if (token.type === TokenType.Legend) {
        handleNestedLegend(this.ctx, parentKind);
        continue;
      }

      // Infra blocks draw a drill-down canvas of their leaf children, so they
      // host boundaries like any other container kind (#2036).
      if (token.type === TokenType.Boundary) {
        boundaries.push(parseBoundaryBlock(this.ctx));
        continue;
      }

      if (token.type === TokenType.Facets) {
        const keyword = this.advance();
        properties.facets ??= [];
        parseFacetsList(this.ctx, keyword, properties.facets);
        continue;
      }

      if (token.type === TokenType.Facet) {
        rejectNestedFacetBlock(this.ctx, parentKind);
        continue;
      }

      this.error("unexpected-token-in-block", {
        blockKind: parentKind,
        tokenType: String(token.type),
        value: token.value,
      });
      this.advance();
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
  private parseLeafNodeContents(
    edges: KrsEdge[],
    properties: CommonProperties & { label?: string; facets?: string[] },
    kind: "table" | "queue-item" | "bucket",
  ): void {
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
        continue;
      }

      if (token.type === TokenType.Description) {
        this.advance();
        properties.description = parseDescriptionValue(this.ctx);
        continue;
      }

      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(parseLink(this.ctx));
        continue;
      }

      if (this.isEdgeStart(token)) {
        edges.push(this.parseEdge());
        continue;
      }

      // A leaf holds no canvas, but it does hold data — a `table` is the
      // canonical carrier of a regulatory facet (CHD, PII), so `facets` is
      // accepted here exactly as on every other kind.
      if (token.type === TokenType.Facets) {
        const keyword = this.advance();
        properties.facets ??= [];
        parseFacetsList(this.ctx, keyword, properties.facets);
        continue;
      }

      if (token.type === TokenType.Facet) {
        rejectNestedFacetBlock(this.ctx, kind);
        continue;
      }

      // A leaf draws no canvas, so a boundary here would have nothing to frame.
      // Named explicitly rather than falling through to unexpected-token, which
      // would not say why (#2036).
      if (token.type === TokenType.Boundary) {
        const block = parseBoundaryBlock(this.ctx);
        this.diagnostics.push({
          severity: "error",
          code: "boundary-not-in-context",
          params: { parentKind: kind },
          loc: block.loc,
        });
        continue;
      }

      this.error("unexpected-token-in-block", {
        blockKind: "sub-resource",
        tokenType: String(token.type),
        value: token.value,
      });
      this.advance();
    }
  }

  /** Try to parse a sub-resource node for the given parent infra kind. Returns null if not applicable. */
  private tryParseInfraSubNode(parentKind: "database" | "queue" | "storage"): KrsNode | null {
    const token = this.peek();

    if (parentKind === "database" && token.type === TokenType.Table) {
      return this.parseInfraSubNode("table");
    }
    if (parentKind === "queue" && token.type === TokenType.Queue) {
      return this.parseInfraSubNode("queue-item");
    }
    if (parentKind === "storage" && token.type === TokenType.Bucket) {
      return this.parseInfraSubNode("bucket");
    }

    return null;
  }

  /** Parse a sub-resource node (table, queue-item, bucket). */
  private parseInfraSubNode(kind: "table" | "queue-item" | "bucket"): KrsNode {
    const start = this.advance(); // keyword token (table / queue / bucket)

    let id: string;
    let idToken: Token;
    if (this.peek().type !== TokenType.Identifier && this.peek().type !== TokenType.StringLiteral) {
      this.error("expected-node-id", { kind: start.value });
      id = "__missing_id";
      idToken = start;
    } else {
      idToken = this.advance();
      id = idToken.value;
    }

    const tags = parseTags(this.ctx);
    const { names: annotations, params: annotationParams } = parseAnnotations(this.ctx);
    const properties: CommonProperties & { label?: string; facets?: string[] } = { links: [] };
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      // Sub-resource nodes (table, queue-item, bucket) are leaf nodes: only properties and
      // edges are allowed inside their bodies. Using a restricted parser avoids accidentally
      // accepting infra keywords (database/queue/storage) as child nodes.
      this.parseLeafNodeContents(edges, properties, kind);
      end = this.expect(TokenType.RightBrace);
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
      loc: this.range(start.loc, end.loc),
      properties: {
        description: properties.description,
        links: properties.links,
      },
    };

    return { ...base, kind } as TableNode | QueueItemNode | BucketNode;
  }

  private parseEdge(implicitFrom?: string): KrsEdge {
    let fromValue: string;
    let startLoc: SourceLocation;
    if (implicitFrom) {
      // Implicit source: arrow token is first, source ID comes from parent block
      fromValue = implicitFrom;
      startLoc = this.peek().loc;
    } else {
      const fromToken = this.advance(); // from identifier or string literal
      fromValue = fromToken.value;
      startLoc = fromToken.loc;
    }
    const arrowToken = this.advance(); // -> or -->
    const toToken = parseIdOrString(this.ctx, "edge target");

    // Support qualified references at any depth: `Sys.Svc`, `Sys.Svc.Domain`, …
    // The two-segment cap lifted with slice E (#2577), together with the
    // resolution that gives the deeper form an effect — accepting a spelling
    // that resolves nowhere is what TPL-1503 forbids. Entity relations share
    // this reader, so deep qualifiers on them lift here too (#2575).
    let toValue = toToken.value;
    let toPath: NodeIdPath | undefined;
    let toEnd = toToken.loc;
    if (this.peek().type === TokenType.Dot) {
      const tail = readNodeIdPathTail(toToken, this.ctx, {
        acceptStringSegments: true,
      });
      // On a dangling dot, keep this site's historical recovery: report, leave
      // the bad token unconsumed, and still join its value into the target.
      if (tail.dangling) {
        this.error("expected-id-or-string", { context: "qualified edge target" });
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
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }

    const tags = parseTags(this.ctx);
    const authorId = this.parseAuthorIdSuffix();
    const block = this.parseEdgeBlock(label);
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
      loc: this.range(startLoc, block.closeLoc ?? toEnd),
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
  private parseEdgeBlock(positionalLabel: string | undefined): {
    label?: string;
    description?: string;
    links?: LinkEntry[];
    facets?: string[];
    /** Location of the closing `}`, so `parseEdge` can span its range over the block. */
    closeLoc?: SourceLocation;
  } {
    if (this.peek().type !== TokenType.LeftBrace) return {};
    this.advance(); // {

    let label: string | undefined;
    let description: string | undefined;
    let links: LinkEntry[] | undefined;
    let facets: string[] | undefined;

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type !== TokenType.StringLiteral) {
          this.error("expected-string-after", { property: "label" });
          continue;
        }
        const value = this.peek().value;
        if (positionalLabel !== undefined) {
          this.error("duplicate-edge-label", { label: value });
        }
        this.advance();
        if (positionalLabel === undefined) label = value;
        continue;
      }

      if (token.type === TokenType.Description) {
        this.advance();
        description = parseDescriptionValue(this.ctx);
        continue;
      }

      if (token.type === TokenType.Link) {
        this.advance();
        (links ??= []).push(parseLink(this.ctx));
        continue;
      }

      // Cross-cutting membership, on the same reader nodes use (#2544): repeated
      // lines accumulate into one array and duplicate ids collapse, so `facets a`
      // twice and `facets a, a` are the same edge.
      if (token.type === TokenType.Facets) {
        const keyword = this.advance();
        facets ??= [];
        parseFacetsList(this.ctx, keyword, facets);
        continue;
      }

      this.error("unexpected-token-in-block", {
        blockKind: "edge",
        tokenType: String(token.type),
        value: token.value,
      });
      this.advance();
    }

    const close = this.expect(TokenType.RightBrace);

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
  private parseAuthorIdSuffix(): string | undefined {
    const next = this.peek();
    if (next.type !== TokenType.Identifier) return undefined;
    if (!next.value.startsWith("#")) return undefined;
    if (next.value.length === 1) return undefined;
    this.advance();
    return next.value.slice(1);
  }
}
