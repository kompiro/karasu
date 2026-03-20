import { TokenType, type Token, type SourceLocation } from "../types/tokens.js";

export class StyleLexer {
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
    tokens.push({ type: TokenType.EOF, value: "", loc: this.loc() });
    return tokens;
  }

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

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
        continue;
      }

      if (ch === "/" && this.peekAt(1) === "/") {
        this.advance();
        this.advance();
        while (this.pos < this.source.length && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }

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
      case ":":
        this.advance();
        return { type: TokenType.Colon, value: ":", loc };
      case ";":
        this.advance();
        return { type: TokenType.Semicolon, value: ";", loc };
      case "#":
        // Distinguish hex color (#ABC123) from ID selector (#MyId)
        // Hex colors: all following chars are hex digits and count is 3,4,6,8
        if (this.isHexColor()) {
          return this.readHexColor(loc);
        }
        this.advance();
        return { type: TokenType.Hash, value: "#", loc };
      case "@":
        this.advance();
        return { type: TokenType.At, value: "@", loc };
      case '"':
        return this.readString(loc);
      default:
        if (isIdentStart(ch)) {
          return this.readIdentifier(loc);
        }
        // Read numeric values (e.g., 0.6, 1.5px, 2px)
        if (isDigit(ch) || (ch === "." && isDigit(this.peekAt(1)))) {
          return this.readValue(loc);
        }
        this.advance();
        return null;
    }
  }

  private isHexColor(): boolean {
    // Look ahead from pos+1: count consecutive hex chars
    let offset = 1;
    while (
      this.pos + offset < this.source.length &&
      isHexChar(this.source[this.pos + offset])
    ) {
      offset++;
    }
    const hexLen = offset - 1;
    // Must be valid hex color length AND not followed by an ident char
    if (hexLen === 0) return false;
    const nextChar = this.source[this.pos + offset] ?? "";
    const followedByIdent = /[a-zA-Z_]/.test(nextChar);
    // If hex chars are followed by more ident chars, it's an ID not a color
    return (
      !followedByIdent &&
      (hexLen === 3 || hexLen === 4 || hexLen === 6 || hexLen === 8)
    );
  }

  private readHexColor(loc: SourceLocation): Token {
    this.advance(); // #
    let value = "#";
    while (this.pos < this.source.length && isHexChar(this.peek())) {
      value += this.advance();
    }
    return { type: TokenType.Identifier, value, loc };
  }

  private readString(loc: SourceLocation): Token {
    this.advance(); // opening "
    let value = "";
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\\") {
        this.advance();
        value += this.advance();
      } else {
        value += this.advance();
      }
    }
    if (this.peek() === '"') this.advance();
    return { type: TokenType.StringLiteral, value, loc };
  }

  private readIdentifier(loc: SourceLocation): Token {
    let value = "";
    while (
      this.pos < this.source.length &&
      isIdentPartWithHyphen(this.peek())
    ) {
      value += this.advance();
    }
    return { type: TokenType.Identifier, value, loc };
  }

  private readValue(loc: SourceLocation): Token {
    let value = "";
    // Read number part (including decimal)
    while (
      this.pos < this.source.length &&
      (isDigit(this.peek()) || this.peek() === ".")
    ) {
      value += this.advance();
    }
    // Read optional unit suffix (px, %, em, etc.)
    while (this.pos < this.source.length && /[a-zA-Z%]/.test(this.peek())) {
      value += this.advance();
    }
    return { type: TokenType.Identifier, value, loc };
  }
}

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_]/.test(ch);
}

function isIdentPartWithHyphen(ch: string): boolean {
  return /[a-zA-Z0-9_-]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexChar(ch: string): boolean {
  return /[0-9a-fA-F]/.test(ch);
}
