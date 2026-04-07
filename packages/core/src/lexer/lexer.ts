import { TokenType, type Token, type SourceLocation } from "../types/tokens.js";

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
  label: TokenType.Label,
  role: TokenType.Role,
  description: TokenType.Description,
  team: TokenType.Team,
  link: TokenType.Link,
  organization: TokenType.Organization,
  member: TokenType.Member,
  owns: TokenType.Owns,
  slack: TokenType.Slack,
  github: TokenType.Github,
  import: TokenType.Import,
  from: TokenType.From,
  database: TokenType.Database,
  queue: TokenType.Queue,
  storage: TokenType.Storage,
  table: TokenType.Table,
  bucket: TokenType.Bucket,
};

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const token = this.readToken();
      if (token) tokens.push(token);
    }
    tokens.push(this.makeToken(TokenType.EOF, ""));
    return tokens;
  }

  private loc(): SourceLocation {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private makeToken(type: TokenType, value: string): Token {
    return { type, value, loc: this.loc() };
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

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
        continue;
      }

      // Line comment
      if (ch === "/" && this.peekAt(1) === "/") {
        this.advance();
        this.advance();
        while (this.pos < this.source.length && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }

      // Block comment
      if (ch === "/" && this.peekAt(1) === "*") {
        this.advance();
        this.advance();
        while (this.pos < this.source.length) {
          if (this.peek() === "*" && this.peekAt(1) === "/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
        continue;
      }

      break;
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
      case '"':
        if (this.peekAt(1) === '"' && this.peekAt(2) === '"') {
          return this.readTripleQuoteString(loc);
        }
        return this.readString(loc);
      case "-":
        return this.readArrow(loc);
      case "@":
        return this.readAtToken(loc);
      case ".":
        this.advance();
        return { type: TokenType.Dot, value: ".", loc };
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

  private readTripleQuoteString(loc: SourceLocation): Token {
    // Consume opening """
    this.advance(); // "
    this.advance(); // "
    this.advance(); // "

    // Skip immediate newline after opening """
    if (this.peek() === "\n") {
      this.advance();
    } else if (this.peek() === "\r" && this.peekAt(1) === "\n") {
      this.advance();
      this.advance();
    }

    let raw = "";
    while (this.pos < this.source.length) {
      if (this.peek() === '"' && this.peekAt(1) === '"' && this.peekAt(2) === '"') {
        break;
      }
      raw += this.advance();
    }

    // Consume closing """
    if (this.peek() === '"') this.advance();
    if (this.peek() === '"') this.advance();
    if (this.peek() === '"') this.advance();

    // Dedent: use the indentation of the closing """ line as the common prefix
    const value = dedentTripleQuote(raw);
    return { type: TokenType.TripleQuote, value, loc };
  }

  private readArrow(loc: SourceLocation): Token {
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
    return { type: TokenType.Identifier, value: "-", loc };
  }

  private readAtToken(loc: SourceLocation): Token {
    this.advance(); // @
    // Check if followed by "import"
    const ahead = this.peekWord();
    if (ahead === "import") {
      // Consume "import"
      for (let i = 0; i < 6; i++) this.advance();
      return { type: TokenType.AtImport, value: "@import", loc };
    }
    return { type: TokenType.At, value: "@", loc };
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
}

function isIdentStart(ch: string): boolean {
  return /[\p{L}_]/u.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}

/**
 * Dedent triple-quoted string content.
 * Uses the indentation of the last line (closing """ line) as the common prefix to strip.
 * Trailing newline before closing """ is removed.
 */
function dedentTripleQuote(raw: string): string {
  const lines = raw.split("\n");

  // The last line contains only the indentation of the closing """
  const lastLine = lines[lines.length - 1];
  const indent = lastLine.match(/^(\s*)/)?.[1] ?? "";

  // Remove the last line (closing """ indent only) if it's whitespace-only
  if (/^\s*$/.test(lastLine)) {
    lines.pop();
  }

  if (indent.length === 0) return lines.join("\n");

  return lines
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
}
