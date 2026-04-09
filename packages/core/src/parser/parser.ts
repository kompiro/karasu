import { TokenType, type Token, type SourceRange } from "../types/tokens.js";
import type {
  KrsFile,
  KrsNode,
  KrsEdge,
  LinkEntry,
  DeployBlock,
  DeployNode,
  DeployNodeProperties,
  ImportDeclaration,
  Diagnostic,
  ParseResult,
  LogicalNodeKind,
  DeployNodeKind,
  DomainNode,
  ServiceNode,
  SystemNode,
  CommonProperties,
  OrganizationBlock,
  TeamNode,
  MemberNode,
  OrgNode,
  TableNode,
  QueueItemNode,
  BucketNode,
} from "../types/ast.js";
import { Lexer } from "../lexer/lexer.js";

const LOGICAL_KEYWORDS = new Set<string>([
  "system",
  "service",
  "domain",
  "usecase",
  "resource",
  "user",
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
      this.error(`Expected ${type} but got ${token.type} ("${token.value}")`);
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

  private error(message: string): void {
    this.diagnostics.push({
      severity: "error",
      message,
      loc: this.range(this.peek().loc),
    });
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
      domains: [],
      deploys: [],
      organizations: [],
      ownerIndex: new Map(),
      nodePathIndex: new Map(),
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
        case TokenType.Domain:
          file.domains.push(this.parseNodeDecl() as DomainNode);
          break;
        case TokenType.Deploy:
          file.deploys.push(this.parseDeployBlock());
          break;
        case TokenType.Organization:
          file.organizations.push(this.parseOrganizationBlock());
          break;
        default:
          this.error(`Unexpected token: ${token.type} ("${token.value}")`);
          this.advance();
      }
    }

    file.ownerIndex = this.buildOwnerIndex(file.organizations);
    file.nodePathIndex = this.buildNodePathIndex(file.systems, file.domains);
    if (file.systems.length > 0 || file.domains.length > 0) {
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
      this.error(
        `Expected { or string literal but got ${this.peek().type} ("${this.peek().value}")`,
      );
      // LeftBrace がない場合は空の import 宣言を返す
      return { ids: [], path: "", loc: this.range(start.loc) };
    }
    this.advance(); // {

    const ids: string[] = [];
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.Identifier) {
        ids.push(this.advance().value);
        this.match(TokenType.Comma);
      } else {
        // 予期しないトークン: エラーを記録してスキップ
        this.error(`Expected identifier but got ${this.peek().type} ("${this.peek().value}")`);
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
    properties: CommonProperties & { role?: string; team?: string; label?: string },
  ): void {
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

      // Property: label
      if (token.type === TokenType.Label) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.label = this.advance().value;
        } else {
          this.error('Expected string literal after "label"');
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
            this.error('Expected string literal after "role"');
          }
        } else {
          this.error(`"role" property is only valid for user nodes`);
          this.advance();
        }
        continue;
      }

      // Property: team (service and domain) — deprecated
      if (token.type === TokenType.Team) {
        if (kind === "service" || kind === "domain") {
          this.diagnostics.push({
            severity: "warning",
            message: `"team" property is deprecated; use an organization block with "owns" instead`,
            loc: this.range(token.loc),
          });
          this.advance();
          if (this.peek().type === TokenType.StringLiteral) {
            properties.team = this.advance().value;
          } else {
            this.error('Expected string literal after "team"');
          }
        } else {
          this.error(`"team" property is only valid for service and domain nodes`);
          this.advance();
        }
        continue;
      }

      // Check for edge: Identifier/StringLiteral -> or -->
      if (
        (token.type === TokenType.Identifier || token.type === TokenType.StringLiteral) &&
        (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
      ) {
        edges.push(this.parseEdge());
        continue;
      }

      // Check for logical node
      // Infra block kinds (database/queue/storage) are only valid as direct children of system.
      if (this.isLogicalKeyword(token)) {
        if (INFRA_BLOCK_KINDS.has(token.value) && kind !== "system") {
          this.error(
            `"${token.value}" is only valid as a direct child of system, not inside "${kind}"`,
          );
          this.advance();
          continue;
        }
        children.push(this.parseNodeDecl());
        continue;
      }

      this.error(`Unexpected token in block: ${token.type} ("${token.value}")`);
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
    this.error('Expected string literal or triple-quoted string after "description"');
    return "";
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
    this.error(`Expected identifier or string literal after "${context}"`);
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
      this.error(`Expected identifier or string literal (id) after "${kind}"`);
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
    const properties: CommonProperties & { role?: string; team?: string; label?: string } = {
      links: [],
    };

    // Optional body
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = idToken;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseBlockContentsWithProperties(children, edges, kind, properties);
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
    this.error(`Unexpected logical node kind: "${kind}"`);
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
      this.error(`Expected identifier or string literal (id) after "resource"`);
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
        message: `resource "${id}" is not assigned to any database`,
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
      this.error(`Expected identifier or string literal (id) after "${kind}"`);
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
          this.error('Expected string literal after "label"');
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

      this.error(`Unexpected token in ${parentKind} block: ${token.type} ("${token.value}")`);
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
          this.error('Expected string literal after "label"');
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

      this.error(
        `Unexpected token in sub-resource block: ${token.type} ("${token.value}"). Sub-resource nodes (table, queue-item, bucket) cannot contain child declarations.`,
      );
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
      this.error(`Expected identifier or string literal (id) after "${start.value}"`);
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

  private parseEdge(): KrsEdge {
    const fromToken = this.advance(); // from identifier or string literal
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
      from: fromToken.value,
      to: toValue,
      label,
      kind: arrowToken.type === TokenType.DashedArrow ? "async" : "sync",
      tags,
      loc: this.range(fromToken.loc, toEnd),
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
          this.error(`Expected value for property "label"`);
        }
      } else if (DEPLOY_KEYWORDS.has(this.peek().value)) {
        nodes.push(this.parseDeployNode());
      } else {
        this.error(
          `Unexpected token in deploy block: ${this.peek().type} ("${this.peek().value}")`,
        );
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
          this.error(`Expected value for property "label"`);
        }
      } else if (DEPLOY_PROPERTY_KEYWORDS.has(this.peek().value)) {
        const propToken = this.advance();
        const propName = propToken.value as keyof DeployNodeProperties;
        // Value can be string literal or identifier
        if (this.peek().type === TokenType.StringLiteral || this.peek().type === TokenType.Identifier) {
          const value = this.advance().value;
          if (propName === "realizes") {
            if (!properties.realizes) properties.realizes = [];
            properties.realizes.push(value);
          } else {
            (properties as Record<string, string>)[propName] = value;
          }
        } else {
          this.error(`Expected value for property "${propName}"`);
        }
      } else {
        this.error(`Unexpected token in deploy node: ${this.peek().type} ("${this.peek().value}")`);
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
          this.error('Expected string literal after "label"');
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
        this.error(`Unexpected token in organization block: ${token.type} ("${token.value}")`);
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
          this.error('Expected string literal after "label"');
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
          this.error('Expected identifier or string literal after "owns"');
        }
      } else if (token.type === TokenType.Member) {
        children.push(this.parseMemberBlock());
      } else if (token.type === TokenType.Team) {
        children.push(this.parseTeamBlock());
      } else {
        this.error(`Unexpected token in team block: ${token.type} ("${token.value}")`);
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
          this.error('Expected string literal after "label"');
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
          this.error('Expected string literal after "slack"');
        }
      } else if (token.type === TokenType.Github) {
        this.advance();
        if (this.peek().type === TokenType.StringLiteral) {
          properties.github = this.advance().value;
        } else {
          this.error('Expected string literal after "github"');
        }
      } else {
        this.error(`Unexpected token in member block: ${token.type} ("${token.value}")`);
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
            message: `"${ownedId}" is already owned by team "${index.get(ownedId)}"; multiple teams cannot own the same service or domain`,
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
          message: `Duplicate team id "${team.id}"`,
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
  ): Map<string, string[]> {
    const index = new Map<string, string[]>();
    // Only service and domain nodes are indexed: these are the only kinds
    // that can appear in `owns` declarations and need navigation support.
    // resource / usecase / user nodes are intentionally excluded so that
    // legitimate shared resources across usecases do not generate warnings.
    const INDEXED_KINDS = new Set(["service", "domain"]);
    const walk = (node: KrsNode, path: string[]): void => {
      const currentPath = [...path, node.id];
      if (INDEXED_KINDS.has(node.kind)) {
        if (index.has(node.id)) {
          this.diagnostics.push({
            severity: "warning",
            message: `Node id "${node.id}" appears in multiple locations; first path is used for navigation`,
            loc: node.loc,
          });
        } else {
          index.set(node.id, currentPath);
        }
      }
      for (const child of node.children) {
        walk(child, currentPath);
      }
    };
    for (const system of systems) {
      this.collectNodeIds(system.children, new Set<string>());
      for (const child of system.children) {
        walk(child, [system.id]);
      }
    }
    // Index top-level domains (not nested in any system)
    for (const domain of domains) {
      walk(domain, []);
    }
    return index;
  }

  private collectNodeIds(nodes: KrsNode[], seen: Set<string>): void {
    for (const node of nodes) {
      if (seen.has(node.id)) {
        this.diagnostics.push({
          severity: "error",
          message: `Duplicate node id "${node.id}" under the same parent`,
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
              message: `"${ownedId}" referenced in "owns" was not found in the system hierarchy`,
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
}
