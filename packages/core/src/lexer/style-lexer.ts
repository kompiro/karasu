import { TokenType, type Token, type SourceLocation, type Trivia } from "../types/tokens.js";

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
      const leadingTrivia = this.collectTrivia();
      if (this.pos >= this.source.length) {
        // Trailing trivia at EOF: attach to the EOF token below.
        tokens.push({ type: TokenType.EOF, value: "", loc: this.loc(), leadingTrivia });
        return tokens;
      }

      const token = this.readToken();
      if (token) {
        tokens.push({ ...token, leadingTrivia });
      }
    }
    tokens.push({ type: TokenType.EOF, value: "", loc: this.loc(), leadingTrivia: [] });
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

  /**
   * Scan whitespace and comments, collecting comment / blank-line trivia
   * for round-trip formatting. Returns trivia in source order; consecutive
   * blank lines collapse into a single `blank-line` Trivia entry.
   */
  private collectTrivia(): Trivia[] {
    const trivia: Trivia[] = [];
    let pendingNewlines = 0;
    let blankLineStart: SourceLocation | null = null;

    const flushBlankLine = (end: SourceLocation): void => {
      if (pendingNewlines >= 2 && blankLineStart) {
        trivia.push({
          kind: "blank-line",
          text: "",
          loc: { start: blankLineStart, end },
        });
      }
      pendingNewlines = 0;
      blankLineStart = null;
    };

    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (ch === "\n") {
        if (pendingNewlines === 0) blankLineStart = this.loc();
        pendingNewlines++;
        this.advance();
        continue;
      }

      if (ch === " " || ch === "\t" || ch === "\r") {
        this.advance();
        continue;
      }

      if (ch === "/" && this.peekAt(1) === "/") {
        flushBlankLine(this.loc());
        const start = this.loc();
        let text = "";
        text += this.advance(); // /
        text += this.advance(); // /
        while (this.pos < this.source.length && this.peek() !== "\n") {
          text += this.advance();
        }
        trivia.push({
          kind: "line-comment",
          text,
          loc: { start, end: this.loc() },
        });
        continue;
      }

      if (ch === "/" && this.peekAt(1) === "*") {
        flushBlankLine(this.loc());
        const start = this.loc();
        let text = "";
        text += this.advance(); // /
        text += this.advance(); // *
        while (this.pos < this.source.length) {
          if (this.peek() === "*" && this.peekAt(1) === "/") {
            text += this.advance(); // *
            text += this.advance(); // /
            break;
          }
          text += this.advance();
        }
        trivia.push({
          kind: "block-comment",
          text,
          loc: { start, end: this.loc() },
        });
        continue;
      }

      break;
    }

    flushBlankLine(this.loc());
    return trivia;
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
      case "=":
        this.advance();
        return { type: TokenType.Equals, value: "=", loc };
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
      case "-":
        return this.readArrow(loc);
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
    while (this.pos + offset < this.source.length && isHexChar(this.source[this.pos + offset])) {
      offset++;
    }
    const hexLen = offset - 1;
    // Must be valid hex color length AND not followed by an ident char
    if (hexLen === 0) return false;
    const nextChar = this.source[this.pos + offset] ?? "";
    const followedByIdent = /[a-zA-Z_]/.test(nextChar);
    // If hex chars are followed by more ident chars, it's an ID not a color
    return !followedByIdent && (hexLen === 3 || hexLen === 4 || hexLen === 6 || hexLen === 8);
  }

  private readHexColor(loc: SourceLocation): Token {
    this.advance(); // #
    let value = "#";
    while (this.pos < this.source.length && isHexChar(this.peek())) {
      value += this.advance();
    }
    return { type: TokenType.Identifier, value, loc };
  }

  /**
   * Lex `->` (sync) or `-->` (async) for use inside `edge#<base>` selectors.
   * Returns null on a bare `-` so unexpected hyphens still fall through to
   * the existing "advance and skip" default at the call site.
   */
  private readArrow(loc: SourceLocation): Token | null {
    this.advance(); // first -
    if (this.peek() === "-") {
      this.advance(); // second -
      if (this.peek() === ">") {
        this.advance(); // >
        return { type: TokenType.DashedArrow, value: "-->", loc };
      }
      // Stray `--`: drop and let the parser recover at the next token.
      return null;
    }
    if (this.peek() === ">") {
      this.advance(); // >
      return { type: TokenType.Arrow, value: "->", loc };
    }
    // Stray `-`: drop.
    return null;
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
    while (this.pos < this.source.length) {
      const ch = this.peek();
      // Hyphens are normally part of identifiers (e.g. `font-family`,
      // `border-style`), but `->` and `-->` are arrow tokens used inside
      // `edge#<base>` selectors. Don't swallow the hyphen when it is the
      // leading character of an arrow.
      if (ch === "-") {
        const after = this.peekAt(1);
        if (after === ">" || (after === "-" && this.peekAt(2) === ">")) break;
      }
      // Dot-notation node references (e.g. `OrderDB.OrderTable` inside an
      // `edge#<base>` selector) are part of the identifier. Only continue
      // consuming when the character after the dot starts another identifier
      // segment — otherwise the dot belongs to a different token (e.g. a
      // numeric value `0.5`, but those go through `readValue`, not here).
      if (ch === "." && isIdentStart(this.peekAt(1))) {
        value += this.advance();
        continue;
      }
      if (!isIdentPartWithHyphen(ch)) break;
      value += this.advance();
    }
    return { type: TokenType.Identifier, value, loc };
  }

  private readValue(loc: SourceLocation): Token {
    let value = "";
    // Read number part (including decimal)
    while (this.pos < this.source.length && (isDigit(this.peek()) || this.peek() === ".")) {
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
