import { TokenType, type Token, type SourceRange, type SourceLocation } from "../types/tokens.js";
import type {
  KrsFile,
  KrsNode,
  KrsEdge,
  LinkEntry,
  DeployBlock,
  DeployNode,
  DeployNodeProperties,
  ImportDeclaration,
  ImportIdPath,
  Diagnostic,
  DiagnosticCode,
  DiagnosticParamsByCode,
  ParseResult,
  LogicalNodeKind,
  DeployNodeKind,
  DomainNode,
  ServiceNode,
  ClientNode,
  SystemNode,
  CommonProperties,
  OrganizationBlock,
  TeamNode,
  MemberNode,
  OrgNode,
  TableNode,
  QueueItemNode,
  BucketNode,
  DatabaseNode,
  QueueGroupNode,
  StorageNode,
  LegendBlock,
  LegendEntry,
  LegendRefTarget,
  LegendViewScope,
} from "../types/ast.js";
import { Lexer } from "../lexer/lexer.js";

const LOGICAL_KEYWORDS = new Set<string>([
  "system",
  "service",
  "domain",
  "usecase",
  "resource",
  "user",
  "client",
  "database",
  "queue",
  "storage",
]);

// Infra block kinds that can appear as system-level children
const INFRA_BLOCK_KINDS = new Set<string>(["database", "queue", "storage"]);

const DEPLOY_KEYWORDS = new Set<string>([
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
]);

const DEPLOY_PROPERTY_KEYWORDS = new Set<string>([
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
]);

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private diagnostics: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  static parse(source: string): ParseResult<KrsFile> {
    const tokens = new Lexer(source).tokenize();
    const parser = new Parser(tokens);
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

  private range(start: Token["loc"], end?: Token["loc"]): SourceRange {
    return {
      start: { ...start },
      end: end ? { ...end } : { ...start },
    };
  }

  parseFile(): ParseResult<KrsFile> {
    const file: KrsFile = {
      styleImports: [],
      nodeImports: [],
      systems: [],
      services: [],
      clients: [],
      domains: [],
      databases: [],
      queues: [],
      storages: [],
      deploys: [],
      organizations: [],
      legends: [],
      ownerIndex: new Map(),
      nodePathIndex: new Map(),
      nodeFileIndex: new Map(),
    };

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
          file.deploys.push(this.parseDeployBlock());
          break;
        case TokenType.Organization:
          file.organizations.push(this.parseOrganizationBlock());
          break;
        case TokenType.Legend:
          file.legends.push(this.parseLegendBlock());
          break;
        default:
          this.error("unexpected-token-root", {
            tokenType: String(token.type),
            value: token.value,
          });
          this.advance();
      }
    }

    file.ownerIndex = this.buildOwnerIndex(file.organizations);
    file.nodePathIndex = this.buildNodePathIndex(file.systems, file.domains, [
      ...file.databases,
      ...file.queues,
      ...file.storages,
    ]);
    if (file.nodePathIndex.size > 0 && file.organizations.length > 0) {
      this.validateOwnsReferences(file.organizations, file.nodePathIndex);
    }

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

    const ids: ImportIdPath[] = [];
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.Identifier) {
        // Read one path: Identifier (Dot Identifier)*
        const path: string[] = [this.advance().value];
        while (this.peek().type === TokenType.Dot) {
          this.advance(); // consume "."
          if (this.peek().type === TokenType.Identifier) {
            path.push(this.advance().value);
          } else {
            // dot without trailing identifier — record error and stop reading
            // segments for this entry; skip the bad token to make progress.
            this.error("expected-identifier", {
              got: String(this.peek().type),
              value: this.peek().value,
            });
            this.advance();
            break;
          }
        }
        ids.push(path);
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
      handles?: string[];
      delivers?: string[];
    },
    parentId?: string,
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
        properties.description = this.parseDescriptionValue();
        continue;
      }

      // Property: link
      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
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
          this.error("property-not-for-node-kind", { property: "role", nodeKind: kind });
          this.advance();
        }
        continue;
      }

      // Property: handles (client and service) — domain ids exposed to callers
      if (token.type === TokenType.Handles) {
        if (kind === "client" || kind === "service") {
          this.advance();
          const ids = this.parseHandlesList();
          if (ids.length > 0) {
            if (!properties.handles) properties.handles = [];
            properties.handles.push(...ids);
          }
        } else {
          this.error("property-not-for-node-kind", { property: "handles", nodeKind: kind });
          this.advance();
        }
        continue;
      }

      // Property: team (service and domain) — deprecated
      if (token.type === TokenType.Team) {
        if (kind === "service" || kind === "domain") {
          this.diagnostics.push({
            severity: "warning",
            code: "team-property-deprecated",
            params: {},
            loc: this.range(token.loc),
          });
          this.advance();
          if (this.peek().type === TokenType.StringLiteral) {
            properties.team = this.advance().value;
          } else {
            this.error("expected-string-after", { property: "team" });
          }
        } else {
          this.error("property-not-for-node-kind", { property: "team", nodeKind: kind });
          this.advance();
        }
        continue;
      }

      // Property: delivers (service only). Comma-separated list of client ids.
      if (token.type === TokenType.Delivers) {
        if (kind === "service") {
          this.advance();
          if (!properties.delivers) properties.delivers = [];
          // Parse one or more identifiers separated by commas.
          while (true) {
            if (
              this.peek().type === TokenType.Identifier ||
              this.peek().type === TokenType.StringLiteral
            ) {
              properties.delivers.push(this.advance().value);
            } else {
              this.error("expected-id-after", { property: "delivers" });
              break;
            }
            if (this.peek().type === TokenType.Comma) {
              this.advance();
              continue;
            }
            break;
          }
        } else {
          this.error("property-not-for-node-kind", { property: "delivers", nodeKind: kind });
          this.advance();
        }
        continue;
      }

      // Implicit-source edge: -> or --> (source = parent node ID)
      if ((token.type === TokenType.Arrow || token.type === TokenType.DashedArrow) && parentId) {
        edges.push(this.parseEdge(parentId));
        continue;
      }

      // Check for edge: Identifier/StringLiteral -> or -->
      if (
        (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
        (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
      ) {
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
      // Identifier set is open by design — see docs/design/client-capability-modeling.md.
      if (kind === "client" && token.type === TokenType.Capability) {
        properties.capabilities ??= [];
        properties.capabilities.push(this.parseClientCapability());
        continue;
      }

      // Check for logical node
      // Infra block kinds (database/queue/storage) are only valid as direct children of system.
      if (this.isLogicalKeyword(token)) {
        if (INFRA_BLOCK_KINDS.has(token.value) && kind !== "system") {
          this.error("infra-not-in-context", {
            infraKind: token.value,
            parentKind: kind,
          });
          this.advance();
          continue;
        }
        children.push(this.parseNodeDecl());
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

  private parseDescriptionValue(): string {
    if (this.peek().type === TokenType.TripleQuote) {
      return this.advance().value;
    }
    if (this.peek().type === TokenType.StringLiteral) {
      return this.advance().value;
    }
    this.error("expected-string-after", { property: "description" });
    return "";
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
    // face-id). The lexer does not include `-` in identifier characters, so it
    // emits the dash as a separate `Identifier("-")` token. Stitch consecutive
    // `<ident>-<ident>` runs back together so `screen-wake-lock` parses as one
    // capability name.
    let name = nameToken.value;
    let end: Token = nameToken;
    while (
      this.peek().type === TokenType.Identifier &&
      this.peek().value === "-" &&
      this.peekAt(1).type === TokenType.Identifier &&
      this.peekAt(1).value !== "-"
    ) {
      this.advance(); // -
      const next = this.advance();
      name += `-${next.value}`;
      end = next;
    }
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
          description = this.parseDescriptionValue();
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

  private parseLink(): LinkEntry {
    const start = this.peek().loc;
    const url = this.expect(TokenType.StringLiteral);
    let label: string | undefined;
    let end = url.loc;
    if (this.peek().type === TokenType.StringLiteral) {
      const labelToken = this.advance();
      label = labelToken.value;
      end = labelToken.loc;
    }
    return { url: url.value, label, loc: this.range(start, end) };
  }

  /**
   * Parse a comma-separated list of identifiers/strings following `handles`.
   * Accepts both `handles A` and `handles A, B, C` forms.
   * Stops at the first non-identifier / non-string token (e.g. newline-introduced
   * keyword on the next line — the lexer is whitespace-insensitive so the
   * comma is the delimiter).
   */
  private parseHandlesList(): string[] {
    const ids: string[] = [];
    if (this.peek().type !== TokenType.Identifier && this.peek().type !== TokenType.StringLiteral) {
      this.error("expected-id-after", { property: "handles" });
      return ids;
    }
    ids.push(this.advance().value);
    while (this.peek().type === TokenType.Comma) {
      this.advance();
      if (
        this.peek().type !== TokenType.Identifier &&
        this.peek().type !== TokenType.StringLiteral
      ) {
        this.error("expected-id-after", { property: "handles" });
        break;
      }
      ids.push(this.advance().value);
    }
    return ids;
  }

  private isLogicalKeyword(token: Token): boolean {
    return LOGICAL_KEYWORDS.has(token.value) && this.isNodeKeywordType(token.type);
  }

  private isNodeKeywordType(type: TokenType): boolean {
    return (
      type === TokenType.System ||
      type === TokenType.Service ||
      type === TokenType.Domain ||
      type === TokenType.Usecase ||
      type === TokenType.Resource ||
      type === TokenType.User ||
      type === TokenType.Client ||
      type === TokenType.Database ||
      type === TokenType.Queue ||
      type === TokenType.Storage
    );
  }

  /** Accept either an identifier or a string literal as an id/reference token. */
  private parseIdOrString(context: string): Token {
    if (this.peek().type === TokenType.Identifier || this.peek().type === TokenType.StringLiteral) {
      return this.advance();
    }
    this.error("expected-id-or-string", { context });
    return this.peek();
  }

  private parseNodeDecl(): KrsNode {
    const start = this.advance(); // keyword
    const kind = start.value as LogicalNodeKind;

    // Delegate infra block parsing to dedicated methods
    if (INFRA_BLOCK_KINDS.has(kind)) {
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
    const tags = this.parseTags();

    // Optional annotations
    const annotations = this.parseAnnotations();

    // Properties (label is now a property inside the block)
    const properties: CommonProperties & {
      role?: string;
      team?: string;
      label?: string;
      resources?: import("../types/ast.js").ClientResource[];
      capabilities?: import("../types/ast.js").ClientCapability[];
      handles?: string[];
      delivers?: string[];
    } = {
      links: [],
    };

    // Optional body
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      const parentId = kind === "service" || kind === "domain" ? id : undefined;
      this.parseBlockContentsWithProperties(children, edges, kind, properties, parentId);
      end = this.expect(TokenType.RightBrace);
    }

    const base = {
      id,
      label: properties.label,
      tags,
      annotations,
      children,
      edges,
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
            team: properties.team,
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
      this.advance(); // consume '.'
      const childToken = this.parseIdOrString("resource child id");
      ref = { parent: id, child: childToken.value };
      id = `${id}.${childToken.value}`;
      idToken = childToken;
    }

    const tags = this.parseTags();
    const annotations = this.parseAnnotations();

    const properties: CommonProperties & { label?: string } = { links: [] };
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseBlockContentsWithProperties(children, edges, "resource", properties);
      end = this.expect(TokenType.RightBrace);
    }

    // Warn for inline resources (no dot-notation, no parent infra block).
    // Resources tagged [external] intentionally have no database parent (they represent
    // external APIs, queues, or services) so the warning is suppressed for them.
    if (!ref && !tags.includes("external")) {
      this.diagnostics.push({
        severity: "warning",
        code: "unassigned-resource",
        params: { resourceId: id },
        loc: this.range(start.loc, end.loc),
      });
    }

    return {
      kind: "resource",
      id,
      label: properties.label,
      tags,
      annotations,
      children,
      edges,
      loc: this.range(start.loc, end.loc),
      properties: {
        description: properties.description,
        links: properties.links,
      },
      ref,
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

    const tags = this.parseTags();
    const annotations = this.parseAnnotations();
    const properties: CommonProperties & { label?: string } = { links: [] };
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseInfraBlockContents(children, edges, kind, properties);
      end = this.expect(TokenType.RightBrace);
    }

    const base = {
      id,
      label: properties.label,
      tags,
      annotations,
      children,
      edges,
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
    properties: CommonProperties & { label?: string },
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
        properties.description = this.parseDescriptionValue();
        continue;
      }

      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
        continue;
      }

      // Edge
      if (
        (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
        (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
      ) {
        edges.push(this.parseEdge());
        continue;
      }

      // Sub-resource declarations
      const subNode = this.tryParseInfraSubNode(parentKind);
      if (subNode) {
        children.push(subNode);
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
    properties: CommonProperties & { label?: string },
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
        properties.description = this.parseDescriptionValue();
        continue;
      }

      if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
        continue;
      }

      if (
        (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
        (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
      ) {
        edges.push(this.parseEdge());
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

    const tags = this.parseTags();
    const annotations = this.parseAnnotations();
    const properties: CommonProperties & { label?: string } = { links: [] };
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      // Sub-resource nodes (table, queue-item, bucket) are leaf nodes: only properties and
      // edges are allowed inside their bodies. Using a restricted parser avoids accidentally
      // accepting infra keywords (database/queue/storage) as child nodes.
      this.parseLeafNodeContents(edges, properties);
      end = this.expect(TokenType.RightBrace);
    }

    const base = {
      id,
      label: properties.label,
      tags,
      annotations,
      children,
      edges,
      loc: this.range(start.loc, end.loc),
      properties: {
        description: properties.description,
        links: properties.links,
      },
    };

    return { ...base, kind } as TableNode | QueueItemNode | BucketNode;
  }

  private parseTags(): string[] {
    const tags: string[] = [];
    if (this.peek().type !== TokenType.LeftBracket) return tags;

    this.advance(); // [
    while (this.peek().type !== TokenType.RightBracket && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.Identifier) {
        tags.push(this.advance().value);
      } else if (this.peek().type === TokenType.Comma) {
        this.advance();
      } else {
        // Accept keyword tokens as tag values too
        tags.push(this.advance().value);
      }
    }
    this.expect(TokenType.RightBracket);
    return tags;
  }

  private parseAnnotations(): string[] {
    const annotations: string[] = [];
    while (this.peek().type === TokenType.At) {
      this.advance(); // @
      if (this.peek().type === TokenType.Identifier) {
        annotations.push(this.advance().value);
      }
    }
    return annotations;
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
    const toToken = this.parseIdOrString("edge target");

    // Support fully qualified cross-system references: SystemId.ServiceId
    let toValue = toToken.value;
    let toEnd = toToken.loc;
    if (this.peek().type === TokenType.Dot) {
      this.advance(); // consume '.'
      const serviceToken = this.parseIdOrString("qualified edge target");
      toValue = `${toToken.value}.${serviceToken.value}`;
      toEnd = serviceToken.loc;
    }

    let label: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }

    const tags = this.parseTags();

    return {
      from: fromValue,
      to: toValue,
      label,
      kind: arrowToken.type === TokenType.DashedArrow ? "async" : "sync",
      tags,
      loc: this.range(startLoc, toEnd),
    };
  }

  private parseDeployBlock(): DeployBlock {
    const start = this.advance(); // deploy
    // Accept identifier (new: deploy Production) or string literal (legacy: deploy "name")
    const idToken =
      this.peek().type === TokenType.Identifier
        ? this.advance()
        : this.expect(TokenType.StringLiteral);
    this.expect(TokenType.LeftBrace);

    const nodes: DeployNode[] = [];
    let label: string | undefined;

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (this.peek().value === "label") {
        this.advance();
        if (
          this.peek().type === TokenType.StringLiteral ||
          this.peek().type === TokenType.Identifier
        ) {
          label = this.advance().value;
        } else {
          this.error("expected-property-value", { propName: "label" });
        }
      } else if (DEPLOY_KEYWORDS.has(this.peek().value)) {
        nodes.push(this.parseDeployNode());
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "deploy",
          tokenType: String(this.peek().type),
          value: this.peek().value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    return {
      id: idToken.value,
      label,
      nodes,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseDeployNode(): DeployNode {
    const start = this.advance(); // deploy kind keyword
    const kind = start.value as DeployNodeKind;
    // Accept identifier (new: oci myApp) or string literal (legacy: oci "my-app")
    const idToken =
      this.peek().type === TokenType.Identifier
        ? this.advance()
        : this.expect(TokenType.StringLiteral);
    this.expect(TokenType.LeftBrace);

    const properties: DeployNodeProperties = {};
    let label: string | undefined;

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (this.peek().value === "label") {
        this.advance();
        if (
          this.peek().type === TokenType.StringLiteral ||
          this.peek().type === TokenType.Identifier
        ) {
          label = this.advance().value;
        } else {
          this.error("expected-property-value", { propName: "label" });
        }
      } else if (DEPLOY_PROPERTY_KEYWORDS.has(this.peek().value)) {
        const propToken = this.advance();
        const propName = propToken.value as keyof DeployNodeProperties;
        // Value can be string literal or identifier
        if (
          this.peek().type === TokenType.StringLiteral ||
          this.peek().type === TokenType.Identifier
        ) {
          const value = this.advance().value;
          if (propName === "realizes") {
            if (!properties.realizes) properties.realizes = [];
            properties.realizes.push(value);
          } else {
            (properties as Record<string, string>)[propName] = value;
          }
        } else {
          this.error("expected-property-value", { propName });
        }
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "deploy node",
          tokenType: String(this.peek().type),
          value: this.peek().value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    return {
      kind,
      id: idToken.value,
      label,
      properties,
      loc: this.range(start.loc, end.loc),
    };
  }

  // ─── Organization ──────────────────────────────────────────────────────────

  private parseOrganizationBlock(): OrganizationBlock {
    const start = this.advance(); // organization
    const idToken = this.parseIdOrString("organization");
    let label: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }
    this.expect(TokenType.LeftBrace);

    const properties: CommonProperties = { links: [] };
    const teams: TeamNode[] = [];

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
      } else if (token.type === TokenType.Description) {
        this.advance();
        properties.description = this.parseDescriptionValue();
      } else if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
      } else if (token.type === TokenType.Team) {
        teams.push(this.parseTeamBlock());
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "organization",
          tokenType: String(token.type),
          value: token.value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    // Validate duplicate team IDs within this organization
    const seen = new Set<string>();
    this.collectTeamIds(teams, seen);

    return {
      id: idToken.value,
      label,
      properties,
      teams,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseTeamBlock(): TeamNode {
    const start = this.advance(); // team
    const idToken = this.parseIdOrString("team");
    let label: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }
    this.expect(TokenType.LeftBrace);

    const properties: CommonProperties & { owns: string[] } = { links: [], owns: [] };
    const children: OrgNode[] = [];

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
      } else if (token.type === TokenType.Description) {
        this.advance();
        properties.description = this.parseDescriptionValue();
      } else if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
      } else if (token.type === TokenType.Owns) {
        this.advance();
        if (
          this.peek().type === TokenType.Identifier ||
          this.peek().type === TokenType.StringLiteral
        ) {
          properties.owns.push(this.advance().value);
        } else {
          this.error("expected-id-after", { property: "owns" });
        }
      } else if (token.type === TokenType.Member) {
        children.push(this.parseMemberBlock());
      } else if (token.type === TokenType.Team) {
        children.push(this.parseTeamBlock());
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "team",
          tokenType: String(token.type),
          value: token.value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    return {
      kind: "team" as const,
      id: idToken.value,
      label,
      properties,
      children,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseMemberBlock(): MemberNode {
    const start = this.advance(); // member
    const idToken = this.parseIdOrString("member");
    let label: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }
    this.expect(TokenType.LeftBrace);

    const properties: CommonProperties & { slack?: string; github?: string } = { links: [] };

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          label = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "label" });
        }
      } else if (token.type === TokenType.Description) {
        this.advance();
        properties.description = this.parseDescriptionValue();
      } else if (token.type === TokenType.Link) {
        this.advance();
        properties.links.push(this.parseLink());
      } else if (token.type === TokenType.Slack) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.slack = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "slack" });
        }
      } else if (token.type === TokenType.Github) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.github = this.advance().value;
        } else {
          this.error("expected-string-after", { property: "github" });
        }
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "member",
          tokenType: String(token.type),
          value: token.value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    return {
      kind: "member" as const,
      id: idToken.value,
      label,
      properties,
      children: [] as const,
      loc: this.range(start.loc, end.loc),
    };
  }

  private buildOwnerIndex(organizations: OrganizationBlock[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const org of organizations) {
      this.indexTeams(org.teams, index);
    }
    return index;
  }

  private indexTeams(teams: TeamNode[], index: Map<string, string>): void {
    for (const team of teams) {
      for (const ownedId of team.properties.owns) {
        if (index.has(ownedId)) {
          this.diagnostics.push({
            severity: "error",
            code: "duplicate-owner-assignment",
            params: { nodeId: ownedId, existingTeam: index.get(ownedId)! },
            loc: team.loc,
          });
        } else {
          index.set(ownedId, team.id);
        }
      }
      this.indexTeams(
        team.children.filter((c): c is TeamNode => c.kind === "team"),
        index,
      );
    }
  }

  private collectTeamIds(teams: TeamNode[], seen: Set<string>): void {
    for (const team of teams) {
      if (seen.has(team.id)) {
        this.diagnostics.push({
          severity: "error",
          code: "duplicate-team-id",
          params: { teamId: team.id },
          loc: team.loc,
        });
      } else {
        seen.add(team.id);
      }
      this.collectTeamIds(
        team.children.filter((c): c is TeamNode => c.kind === "team"),
        seen,
      );
    }
  }

  private buildNodePathIndex(
    systems: SystemNode[],
    domains: DomainNode[] = [],
    topLevelInfra: KrsNode[] = [],
  ): Map<string, string[]> {
    const index = new Map<string, string[]>();
    // INDEXED_KINDS governs the recursive walk() pass: service and domain are
    // the only kinds tracked here because they appear in `owns` declarations,
    // require migration-annotation priority logic, and need cross-system
    // duplicate detection. resource / usecase / user are intentionally
    // excluded so shared resources across usecases don't generate warnings.
    // Top-level infra nodes (database/queue/storage) are indexed separately
    // via the topLevelInfra loop below, which does not apply these filters.
    const INDEXED_KINDS = new Set(["service", "domain"]);
    // seenDomainIds is reset per system so that the same domain ID in different
    // systems does not trigger an error (cross-system parallel modelling is allowed).
    // The map value is the index priority of the already-stored domain:
    //   2 = @migration_target (active destination, highest priority)
    //   1 = no migration annotation
    //   0 = @deprecated (migration source, lowest priority)
    // A duplicate is allowed when at least one side carries a migration annotation.
    // The higher-priority domain wins the nodePathIndex entry.
    //
    // A domain with no annotations of its own inherits its parent service's
    // annotations for the priority computation (consistent with the rendering
    // inheritance — see docs/design/inherit-service-annotations.md). This
    // makes `service Legacy @deprecated { domain Order {} }` and
    // `service NewSvc @migration_target { domain Order {} }` a legal
    // migration-coexistence pair even without annotations on the domains.
    const walk = (
      node: KrsNode,
      path: string[],
      seenDomainIds: Map<string, number>,
      parentServiceAnnotations: string[],
    ): void => {
      const currentPath = [...path, node.id];
      if (INDEXED_KINDS.has(node.kind)) {
        if (node.kind === "domain") {
          const effective =
            node.annotations.length > 0 ? node.annotations : parentServiceAnnotations;
          const priority = effective.includes("migration_target")
            ? 2
            : effective.includes("deprecated")
              ? 0
              : 1;
          if (seenDomainIds.has(node.id)) {
            const existingPriority = seenDomainIds.get(node.id)!;
            if (priority === 1 && existingPriority === 1) {
              // Neither duplicate carries a migration annotation → error (existing behaviour)
              this.diagnostics.push({
                severity: "error",
                code: "domain-id-not-unique",
                params: { domainId: node.id },
                loc: node.loc,
              });
            }
            // Higher priority wins the index
            if (priority > existingPriority) {
              index.set(node.id, currentPath);
              seenDomainIds.set(node.id, priority);
            }
          } else {
            seenDomainIds.set(node.id, priority);
            index.set(node.id, currentPath);
          }
        } else {
          if (index.has(node.id)) {
            this.diagnostics.push({
              severity: "warning",
              code: "node-id-multiple-locations",
              params: { nodeId: node.id },
              loc: node.loc,
            });
          } else {
            index.set(node.id, currentPath);
          }
        }
      }
      const nextServiceAnnotations =
        node.kind === "service" ? node.annotations : parentServiceAnnotations;
      for (const child of node.children) {
        walk(child, currentPath, seenDomainIds, nextServiceAnnotations);
      }
    };
    for (const system of systems) {
      this.collectNodeIds(system.children, new Set<string>());
      const seenDomainIds = new Map<string, number>();
      for (const child of system.children) {
        walk(child, [system.id], seenDomainIds, []);
      }
    }
    // Index top-level domains (not nested in any system)
    // Each top-level domain is its own scope; no cross-domain uniqueness check needed here.
    for (const domain of domains) {
      walk(domain, [], new Map<string, number>(), []);
    }
    // Index top-level infra nodes (database/queue/storage) and their sub-resources.
    for (const infra of topLevelInfra) {
      index.set(infra.id, [infra.id]);
      for (const child of infra.children) {
        index.set(child.id, [infra.id, child.id]);
      }
    }
    return index;
  }

  private collectNodeIds(nodes: KrsNode[], seen: Set<string>): void {
    for (const node of nodes) {
      if (seen.has(node.id)) {
        this.diagnostics.push({
          severity: "error",
          code: "duplicate-node-id-parent",
          params: { nodeId: node.id },
          loc: node.loc,
        });
      } else {
        seen.add(node.id);
      }
      this.collectNodeIds(node.children, new Set<string>());
    }
  }

  private validateOwnsReferences(
    organizations: OrganizationBlock[],
    nodePathIndex: Map<string, string[]>,
  ): void {
    const check = (teams: TeamNode[]): void => {
      for (const team of teams) {
        for (const ownedId of team.properties.owns) {
          if (!nodePathIndex.has(ownedId)) {
            this.diagnostics.push({
              severity: "warning",
              code: "owns-target-not-found",
              params: { ownedId },
              loc: team.loc,
            });
          }
        }
        check(team.children.filter((c): c is TeamNode => c.kind === "team"));
      }
    };
    for (const org of organizations) {
      check(org.teams);
    }
  }

  // ─── Legend block ────────────────────────────────────────────────────────
  // Grammar: `legend <view-scope>? <title?> { (swatch | ref)* }`
  //   view-scope ::= "system" | "deploy" | "org"
  //   swatch     ::= "swatch" "#" hex-id <string>
  //   ref        ::= "ref" ("@" id | "[" id "]" | "." id | "#" id | id) <string>
  //
  // Reference: docs/design/diagram-legend.md.

  private parseLegendBlock(): LegendBlock {
    const start = this.advance(); // legend

    const scope = this.parseLegendScope();

    let title: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      title = this.advance().value;
    }

    this.expect(TokenType.LeftBrace);

    const entries: LegendEntry[] = [];
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type === TokenType.Swatch) {
        const entry = this.parseLegendSwatch();
        if (entry) entries.push(entry);
      } else if (token.type === TokenType.Ref) {
        const entry = this.parseLegendRef();
        if (entry) entries.push(entry);
      } else {
        this.error("unexpected-token-in-block", {
          blockKind: "legend",
          tokenType: String(token.type),
          value: token.value,
        });
        this.advance();
      }
    }

    const end = this.expect(TokenType.RightBrace);

    return {
      scope,
      title,
      entries,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseLegendScope(): LegendViewScope | undefined {
    const next = this.peek();
    if (next.type === TokenType.System) {
      this.advance();
      return "system";
    }
    if (next.type === TokenType.Deploy) {
      this.advance();
      return "deploy";
    }
    // "org" is intentionally not a reserved keyword (the block keyword is
    // "organization"). Match it contextually as an identifier here.
    if (next.type === TokenType.Identifier && next.value === "org") {
      this.advance();
      return "org";
    }
    return undefined;
  }

  private parseLegendSwatch(): LegendEntry | null {
    const start = this.advance(); // swatch
    // The lexer emits `#xxx` as a single Identifier token (see lexer's
    // readHashToken). The parser stores the value verbatim and lets the
    // resolver / renderer validate the hex shape.
    const colorTok = this.expect(TokenType.Identifier);
    const labelTok = this.expect(TokenType.StringLiteral);
    return {
      kind: "swatch",
      color: colorTok.value,
      label: labelTok.value,
      loc: this.range(start.loc, labelTok.loc),
    };
  }

  private parseLegendRef(): LegendEntry | null {
    const start = this.advance(); // ref
    const target = this.parseLegendRefTarget();
    if (!target) {
      // Skip until label or end of entry to recover.
      if (this.peek().type === TokenType.StringLiteral) this.advance();
      return null;
    }
    const labelTok = this.expect(TokenType.StringLiteral);
    return {
      kind: "ref",
      target,
      label: labelTok.value,
      loc: this.range(start.loc, labelTok.loc),
    };
  }

  private parseLegendRefTarget(): LegendRefTarget | null {
    const tok = this.peek();
    switch (tok.type) {
      case TokenType.At: {
        this.advance();
        const name = this.expect(TokenType.Identifier);
        return { kind: "annotation", name: name.value };
      }
      case TokenType.LeftBracket: {
        this.advance();
        const name = this.expect(TokenType.Identifier);
        this.expect(TokenType.RightBracket);
        return { kind: "tag", name: name.value };
      }
      case TokenType.Dot: {
        this.advance();
        const name = this.expect(TokenType.Identifier);
        return { kind: "selector", selector: `.${name.value}` };
      }
      case TokenType.Identifier: {
        // `#xxx` is lexed as a single Identifier with the leading `#`
        // (see lexer's readHashToken). All other identifiers are bare type
        // selectors (e.g. unknown custom kinds).
        const name = this.advance();
        return { kind: "selector", selector: name.value };
      }
      default:
        // Accept node-kind keywords as type selectors (e.g. `service`,
        // `domain`, `client`). The lexer reserves these as keywords for
        // block parsing; here they are valid `.krs.style` selector names.
        if (isTypeSelectorKeyword(tok.type)) {
          const name = this.advance();
          return { kind: "selector", selector: name.value };
        }
        this.error("expected-identifier", {
          got: String(tok.type),
          value: tok.value,
        });
        this.advance();
        return null;
    }
  }
}

const TYPE_SELECTOR_KEYWORDS = new Set<TokenType>([
  TokenType.System,
  TokenType.Service,
  TokenType.Domain,
  TokenType.Usecase,
  TokenType.Resource,
  TokenType.User,
  TokenType.Client,
  TokenType.Database,
  TokenType.Queue,
  TokenType.Storage,
  TokenType.Table,
  TokenType.Bucket,
  TokenType.Team,
  TokenType.Member,
  TokenType.Organization,
]);

function isTypeSelectorKeyword(type: TokenType): boolean {
  return TYPE_SELECTOR_KEYWORDS.has(type);
}
