import { TokenType, type Token, type SourceRange } from "../types/tokens.js";
import { readNodeIdPathTail } from "./node-path.js";
import type {
  KrsFile,
  ImportDeclaration,
  ImportEntry,
  Diagnostic,
  DiagnosticCode,
  DiagnosticParamsByCode,
  ParseResult,
  SystemNode,
  DomainNode,
  ServiceNode,
  ClientNode,
  DatabaseNode,
  QueueGroupNode,
  StorageNode,
} from "../types/ast.js";
import { createEmptyKrsFile } from "../types/ast.js";
import { Lexer } from "../lexer/lexer.js";
import { LOGICAL_KEYWORDS } from "./parser-keywords.js";
import { parseLegendBlock } from "./legend-parser.js";
import { parseOrganizationBlock, parseBoundaryBlock, parseFacetBlock } from "./org-parser.js";
import { parseDeployBlock } from "./deploy-parser.js";
import { parseNodeDecl } from "./node-parser.js";
import { parseInfraBlock } from "./infra-parser.js";
import { isEdgeStart, parseEdge } from "./edge-parser.js";
import { finalizeFile } from "./finalize-file.js";
import type { ParseContext } from "./parse-context.js";

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
    tryParseNodeDecl: () =>
      this.isLogicalKeyword(this.peek()) ? parseNodeDecl(this.ctx) : undefined,
    tryParseEdge: () => (isEdgeStart(this.ctx, this.peek()) ? parseEdge(this.ctx) : undefined),
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
          file.systems.push(parseNodeDecl(this.ctx) as SystemNode);
          break;
        case TokenType.Service:
          file.services.push(parseNodeDecl(this.ctx) as ServiceNode);
          break;
        case TokenType.Client:
          file.clients.push(parseNodeDecl(this.ctx) as ClientNode);
          break;
        case TokenType.Domain:
          file.domains.push(parseNodeDecl(this.ctx) as DomainNode);
          break;
        case TokenType.Database:
          file.databases.push(
            parseInfraBlock(this.ctx, this.advance(), "database") as DatabaseNode,
          );
          break;
        case TokenType.Queue:
          file.queues.push(parseInfraBlock(this.ctx, this.advance(), "queue") as QueueGroupNode);
          break;
        case TokenType.Storage:
          file.storages.push(parseInfraBlock(this.ctx, this.advance(), "storage") as StorageNode);
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
          parseNodeDecl(this.ctx);
          break;
        case TokenType.Entity: {
          // An `entity` is only valid as a `domain` child. Consume the whole
          // declaration and emit the dedicated diagnostic (not the generic
          // unexpected-token cascade) so the canonical mistake reads clearly.
          const stray = parseNodeDecl(this.ctx);
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
          if (isEdgeStart(this.ctx, token)) {
            this.error("top-level-declaration", { construct: "edge" });
            parseEdge(this.ctx);
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

  private isLogicalKeyword(token: Token): boolean {
    return LOGICAL_KEYWORDS.has(token.value) && this.isNodeKeywordType(token.type);
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
}
