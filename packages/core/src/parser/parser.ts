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
  SystemNode,
  ServiceNode,
  CommonProperties,
} from "../types/ast.js";
import { Lexer } from "../lexer/lexer.js";

const LOGICAL_KEYWORDS = new Set<string>([
  "system",
  "service",
  "domain",
  "usecase",
  "resource",
  "user",
]);

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
      deploys: [],
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
        case TokenType.Deploy:
          file.deploys.push(this.parseDeployBlock());
          break;
        default:
          this.error(`Unexpected token: ${token.type} ("${token.value}")`);
          this.advance();
      }
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

    if (this.peek().type !== TokenType.LeftBrace) {
      this.error(`Expected { but got ${this.peek().type} ("${this.peek().value}")`);
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

  private parseSystemBlock(): SystemNode {
    const start = this.advance(); // system
    const label = this.expect(TokenType.StringLiteral);
    this.expect(TokenType.LeftBrace);

    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    const properties: CommonProperties = { links: [] };

    this.parseBlockContentsWithProperties(children, edges, "system", properties);

    const end = this.expect(TokenType.RightBrace);

    return {
      kind: "system",
      label: label.value,
      tags: [],
      annotations: [],
      children,
      edges,
      properties,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseBlockContentsWithProperties(
    children: KrsNode[],
    edges: KrsEdge[],
    kind: LogicalNodeKind,
    properties: CommonProperties & { role?: string; team?: string },
  ): void {
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const token = this.peek();

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

      // Property: team (service and domain)
      if (token.type === TokenType.Team) {
        if (kind === "service" || kind === "domain") {
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

      // Check for edge: Identifier -> or -->
      if (
        token.type === TokenType.Identifier &&
        (this.peekAt(1).type === TokenType.Arrow || this.peekAt(1).type === TokenType.DashedArrow)
      ) {
        edges.push(this.parseEdge());
        continue;
      }

      // Check for logical node
      if (this.isLogicalKeyword(token)) {
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
      type === TokenType.User
    );
  }

  private parseNodeDecl(): KrsNode {
    const start = this.advance(); // keyword
    const kind = start.value as LogicalNodeKind;

    let id: string | undefined;
    let label = "";
    let lastConsumed = start;

    // After keyword, we may have: Identifier StringLiteral or just StringLiteral
    if (this.peek().type === TokenType.Identifier) {
      lastConsumed = this.advance();
      id = lastConsumed.value;
      if (this.peek().type === TokenType.StringLiteral) {
        lastConsumed = this.advance();
        label = lastConsumed.value;
      }
    } else if (this.peek().type === TokenType.StringLiteral) {
      lastConsumed = this.advance();
      label = lastConsumed.value;
    }

    // Detect deprecated positional description and emit error
    if (this.peek().type === TokenType.StringLiteral) {
      this.diagnostics.push({
        severity: "error",
        message:
          `位置引数の description は廃止されました。description プロパティを使用してください: ` +
          `${kind}${id ? " " + id : ""} "${label}" { description "..." }`,
        loc: this.range(this.peek().loc),
      });
      // Consume the positional description to continue parsing
      this.advance();
    }

    // Optional tags
    const tags = this.parseTags();

    // Optional annotations
    const annotations = this.parseAnnotations();

    // Properties
    const properties: CommonProperties & { role?: string; team?: string } = {
      links: [],
    };

    // Optional body
    const children: KrsNode[] = [];
    const edges: KrsEdge[] = [];
    let end = lastConsumed;

    if (this.peek().type === TokenType.LeftBrace) {
      this.advance();
      this.parseBlockContentsWithProperties(children, edges, kind, properties);
      end = this.expect(TokenType.RightBrace);
    }

    const base = {
      id,
      label,
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
      case "resource":
        return {
          ...base,
          kind,
          properties: {
            description: properties.description,
            links: properties.links,
          },
        };
    }
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
    const fromToken = this.advance(); // from identifier
    const arrowToken = this.advance(); // -> or -->
    const toToken = this.expect(TokenType.Identifier);

    let label: string | undefined;
    if (this.peek().type === TokenType.StringLiteral) {
      label = this.advance().value;
    }

    const tags = this.parseTags();

    return {
      from: fromToken.value,
      to: toToken.value,
      label,
      kind: arrowToken.type === TokenType.DashedArrow ? "async" : "sync",
      tags,
      loc: this.range(fromToken.loc, toToken.loc),
    };
  }

  private parseDeployBlock(): DeployBlock {
    const start = this.advance(); // deploy
    const label = this.expect(TokenType.StringLiteral);
    this.expect(TokenType.LeftBrace);

    const nodes: DeployNode[] = [];
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (DEPLOY_KEYWORDS.has(this.peek().value)) {
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
      label: label.value,
      nodes,
      loc: this.range(start.loc, end.loc),
    };
  }

  private parseDeployNode(): DeployNode {
    const start = this.advance(); // deploy kind keyword
    const kind = start.value as DeployNodeKind;
    const id = this.expect(TokenType.StringLiteral);
    this.expect(TokenType.LeftBrace);

    const properties: DeployNodeProperties = {};

    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      if (DEPLOY_PROPERTY_KEYWORDS.has(this.peek().value)) {
        const propToken = this.advance();
        const propName = propToken.value as keyof DeployNodeProperties;
        // Value can be string literal or identifier
        if (this.peek().type === TokenType.StringLiteral) {
          properties[propName] = this.advance().value;
        } else if (this.peek().type === TokenType.Identifier) {
          properties[propName] = this.advance().value;
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
      id: id.value,
      properties,
      loc: this.range(start.loc, end.loc),
    };
  }
}
