import { TokenType, type Token, type SourceLocation } from "../types/tokens.js";
import type { Diagnostic, DiagnosticSeverity } from "../types/ast.js";

const KEYWORDS: Record<string, TokenType> = {
  system: TokenType.System,
  service: TokenType.Service,
  domain: TokenType.Domain,
  usecase: TokenType.Usecase,
  resource: TokenType.Resource,
  user: TokenType.User,
  deploy: TokenType.Deploy,
  war: TokenType.War,
  jar: TokenType.Jar,
  oci: TokenType.Oci,
  lambda: TokenType.Lambda,
  function: TokenType.Function,
  assets: TokenType.Assets,
  job: TokenType.Job,
  artifact: TokenType.Artifact,
  runtime: TokenType.Runtime,
  realizes: TokenType.Realizes,
  schedule: TokenType.Schedule,
  image: TokenType.Image,
  type: TokenType.Type,
  role: TokenType.Role,
  description: TokenType.Description,
  team: TokenType.Team,
  link: TokenType.Link,
  links: TokenType.Links,
  import: TokenType.Import,
  from: TokenType.From,
};

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;

  // INDENT/DEDENT state
  private indentStack: number[] = [0];
  private indentUnit = 0;
  private tokens: Token[] = [];
  private diagnostics: Diagnostic[] = [];

  // Pipe block state
  private inPipeBlock = false;
  private pipeBlockIndent = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    return this.tokenizeWithDiagnostics().tokens;
  }

  tokenizeWithDiagnostics(): LexResult {
    this.tokenizeLine();

    // Emit remaining DEDENTs at EOF
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.emit(TokenType.Dedent, "");
    }
    this.emit(TokenType.EOF, "");

    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private tokenizeLine(): void {
    while (this.pos < this.source.length) {
      // At the start of each line, handle indentation
      const lineIndent = this.measureIndent();

      // Skip blank lines and comment-only lines
      if (this.isAtEnd() || this.peek() === "\n" || this.peek() === "\r") {
        this.consumeNewline();
        continue;
      }
      if (this.isCommentStart()) {
        this.skipComment();
        this.consumeNewline();
        continue;
      }

      // Pipe block: collect raw text
      if (this.inPipeBlock) {
        if (lineIndent > this.pipeBlockIndent) {
          this.collectPipeBlock(lineIndent);
          continue;
        }
        // Indent is at or below pipe block level: end pipe block
        this.inPipeBlock = false;
      }

      // INDENT/DEDENT processing
      this.processIndentation(lineIndent);

      // Tokenize inline content until end of line
      this.tokenizeInlineContent();

      // Emit Newline
      if (this.pos < this.source.length) {
        this.emit(TokenType.Newline, "\\n");
        this.consumeNewline();
      }
    }
  }

  private measureIndent(): number {
    let spaces = 0;
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === " ") {
        spaces++;
        this.advance();
      } else if (ch === "\t") {
        this.addDiagnostic("error", "Tabs are not allowed for indentation; use spaces");
        this.advance();
        spaces++; // treat as 1 space to continue parsing
      } else {
        break;
      }
    }
    return spaces;
  }

  private processIndentation(spaces: number): void {
    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (spaces > currentIndent) {
      // INDENT
      if (this.indentUnit === 0) {
        this.indentUnit = spaces - currentIndent;
      } else if (spaces - currentIndent !== this.indentUnit) {
        this.addDiagnostic(
          "error",
          `Inconsistent indentation: expected ${this.indentUnit} spaces, got ${spaces - currentIndent}`,
        );
      }
      this.indentStack.push(spaces);
      this.emit(TokenType.Indent, "");
    } else if (spaces < currentIndent) {
      // DEDENT (possibly multiple)
      while (this.indentStack.length > 1 && spaces < this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.pop();
        this.emit(TokenType.Dedent, "");
      }
      if (spaces !== this.indentStack[this.indentStack.length - 1]) {
        this.addDiagnostic("error", "Indentation does not match any outer level");
      }
    }
    // spaces === currentIndent: no change
  }

  private collectPipeBlock(firstLineIndent: number): void {
    const loc = this.loc();
    const lines: string[] = [];
    const baseIndent = firstLineIndent;

    // Collect the first line (cursor is after the indent spaces)
    lines.push(this.readRestOfLine());
    this.consumeNewline();

    // Collect subsequent lines
    while (this.pos < this.source.length) {
      const savedPos = this.pos;
      const savedLine = this.line;
      const savedColumn = this.column;
      const indent = this.measureIndent();

      // Blank line: preserve it
      if (this.isAtEnd() || this.peek() === "\n" || this.peek() === "\r") {
        lines.push("");
        this.consumeNewline();
        continue;
      }

      // Comment-only line within pipe block: treat as content
      // (users might have markdown with // in it)

      if (indent <= this.pipeBlockIndent) {
        // End of pipe block — restore position
        this.pos = savedPos;
        this.line = savedLine;
        this.column = savedColumn;
        break;
      }

      lines.push(" ".repeat(indent - baseIndent) + this.readRestOfLine());
      this.consumeNewline();
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    this.inPipeBlock = false;
    this.tokens.push({ type: TokenType.StringLiteral, value: lines.join("\n"), loc });
  }

  private tokenizeInlineContent(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      // End of line
      if (ch === "\n" || ch === "\r") break;

      // Skip inline whitespace
      if (ch === " " || ch === "\t") {
        this.advance();
        continue;
      }

      // Skip inline comments
      if (ch === "/" && this.peekAt(1) === "/") {
        this.skipLineComment();
        break; // line comment consumes to end of line
      }
      if (ch === "/" && this.peekAt(1) === "*") {
        this.skipBlockComment();
        continue;
      }

      const token = this.readToken();
      if (token) this.tokens.push(token);
    }
  }

  private readToken(): Token | null {
    const ch = this.peek();
    const loc = this.loc();

    switch (ch) {
      case "{":
        this.advance();
        return { type: TokenType.LeftBrace, value: "{", loc };
      case "}":
        this.advance();
        return { type: TokenType.RightBrace, value: "}", loc };
      case "[":
        this.advance();
        return { type: TokenType.LeftBracket, value: "[", loc };
      case "]":
        this.advance();
        return { type: TokenType.RightBracket, value: "]", loc };
      case "(":
        this.advance();
        return { type: TokenType.LeftParen, value: "(", loc };
      case ")":
        this.advance();
        return { type: TokenType.RightParen, value: ")", loc };
      case ",":
        this.advance();
        return { type: TokenType.Comma, value: ",", loc };
      case ":":
        this.advance();
        return { type: TokenType.Colon, value: ":", loc };
      case "|":
        this.advance();
        this.inPipeBlock = true;
        // pipeBlockIndent = current line's indent level (from the indent stack)
        this.pipeBlockIndent = this.indentStack[this.indentStack.length - 1];
        return { type: TokenType.Pipe, value: "|", loc };
      case '"':
        return this.readString(loc);
      case "-":
        return this.readDashOrArrow(loc);
      case "@":
        return this.readAtToken(loc);
      default:
        if (isIdentStart(ch)) {
          return this.readIdentifierOrKeyword(loc);
        }
        // Skip unknown character
        this.advance();
        return null;
    }
  }

  private readString(loc: SourceLocation): Token {
    this.advance(); // opening "
    let value = "";
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\n" || this.peek() === "\r") break; // unterminated string
      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.advance();
        if (escaped === '"') value += '"';
        else if (escaped === "\\") value += "\\";
        else if (escaped === "n") value += "\n";
        else value += escaped;
      } else {
        value += this.advance();
      }
    }
    if (this.peek() === '"') this.advance(); // closing "
    return { type: TokenType.StringLiteral, value, loc };
  }

  private readDashOrArrow(loc: SourceLocation): Token {
    this.advance(); // first -
    if (this.peek() === "-") {
      this.advance(); // second -
      if (this.peek() === ">") {
        this.advance(); // >
        return { type: TokenType.DashedArrow, value: "-->", loc };
      }
      // Not a valid token, treat as unknown
      return { type: TokenType.Identifier, value: "--", loc };
    }
    if (this.peek() === ">") {
      this.advance(); // >
      return { type: TokenType.Arrow, value: "->", loc };
    }
    // Bare `-` = Dash (list item marker)
    return { type: TokenType.Dash, value: "-", loc };
  }

  private readAtToken(loc: SourceLocation): Token {
    this.advance(); // @
    const ahead = this.peekWord();
    if (ahead === "import") {
      for (let i = 0; i < 6; i++) this.advance();
      return { type: TokenType.AtImport, value: "@import", loc };
    }
    return { type: TokenType.At, value: "@", loc };
  }

  private readIdentifierOrKeyword(loc: SourceLocation): Token {
    let value = "";
    while (this.pos < this.source.length && isIdentPart(this.peek())) {
      value += this.advance();
    }
    const kwType = KEYWORDS[value];
    if (kwType) {
      return { type: kwType, value, loc };
    }
    return { type: TokenType.Identifier, value, loc };
  }

  // ─── Helpers ─────────────────────────────────────────

  private loc(): SourceLocation {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private peek(): string {
    return this.source[this.pos] ?? "";
  }

  private peekAt(offset: number): string {
    return this.source[this.pos + offset] ?? "";
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peekWord(): string {
    let word = "";
    let offset = 0;
    while (this.pos + offset < this.source.length && isIdentPart(this.source[this.pos + offset])) {
      word += this.source[this.pos + offset];
      offset++;
    }
    return word;
  }

  private emit(type: TokenType, value: string): void {
    this.tokens.push({ type, value, loc: this.loc() });
  }

  private readRestOfLine(): string {
    let line = "";
    while (this.pos < this.source.length && this.peek() !== "\n" && this.peek() !== "\r") {
      line += this.advance();
    }
    return line;
  }

  private consumeNewline(): void {
    if (this.pos < this.source.length && this.peek() === "\r") {
      this.advance();
    }
    if (this.pos < this.source.length && this.peek() === "\n") {
      this.advance();
    }
  }

  private isCommentStart(): boolean {
    return this.peek() === "/" && (this.peekAt(1) === "/" || this.peekAt(1) === "*");
  }

  private skipComment(): void {
    if (this.peek() === "/" && this.peekAt(1) === "/") {
      this.skipLineComment();
    } else if (this.peek() === "/" && this.peekAt(1) === "*") {
      this.skipBlockComment();
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.source.length && this.peek() !== "\n" && this.peek() !== "\r") {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(); // /
    this.advance(); // *
    while (this.pos < this.source.length) {
      if (this.peek() === "*" && this.peekAt(1) === "/") {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }
  }

  private addDiagnostic(severity: DiagnosticSeverity, message: string): void {
    this.diagnostics.push({
      severity,
      message,
      loc: {
        start: { ...this.loc() },
        end: { ...this.loc() },
      },
    });
  }
}

function isIdentStart(ch: string): boolean {
  return /[\p{L}_]/u.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}
