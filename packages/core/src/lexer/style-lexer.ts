import { TokenType, type Token, type SourceLocation, type Trivia } from "../types/tokens.js";
import {
  codePointAt,
  isIdentPart as isKrsIdentPart,
  isIdentStart as isKrsIdentStart,
  isWhitespace,
  wordPartAt,
} from "./lexer.js";

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

  /** The code point at the cursor, so a letter outside the BMP reads as one character. */
  private peek(): string {
    return codePointAt(this.source, this.pos);
  }

  private peekAt(offset: number): string {
    return this.source[this.pos + offset] ?? "";
  }

  /** Consume one code point. Columns count UTF-16 units, as the `.krs` lexer does. */
  private advance(): string {
    const ch = codePointAt(this.source, this.pos);
    this.pos += ch.length;
    if (ch === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column += ch.length;
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

      // Every Unicode `White_Space` character and the BOM, as in `.krs` (#3093):
      // U+3000 typed in a Japanese IME would otherwise be an Unknown token.
      if (isWhitespace(ch)) {
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
        // A sign before a number belongs to the value (`label-offset: -20px`).
        // Dropping it, as a stray `-`, read the value as its absolute (#3032).
        if (isDigit(this.peekAt(1)) || (this.peekAt(1) === "." && isDigit(this.peekAt(2)))) {
          return this.readValue(loc);
        }
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
        if (!isAscii(ch)) return this.readUnknown(loc);
        // Skip any other ASCII character. The parser never learns it was there,
        // so it cannot refuse it; `style-lexer.test.ts` pins the dropped set.
        // Non-ASCII used to land here too, so `[日本語]` was read as the tag
        // `]` and never matched (#3140).
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
    // Anything that continues a word keeps the run in an id, not only what can
    // start one: a combining mark or a non-ASCII digit (`#café`, written
    // decomposed), or a `-` before a word character (`#add-on`). Otherwise the
    // selector stopped at `#cafe` / `#add` and could not name the id (#3140).
    const end = this.pos + offset;
    const followedByIdent =
      wordPartAt(this.source, end, this.source[end - 1]) !== "" ||
      (this.source[end] === "-" && isIdentPart(codePointAt(this.source, end + 1)));
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
   * A `-` or `--` that starts neither an arrow nor a number is an Unknown
   * token: dropping it turned `label-offset: - 20px` into `20px` with no
   * diagnostic (#3140, TPL-2707).
   */
  private readArrow(loc: SourceLocation): Token {
    this.advance(); // first -
    if (this.peek() === "-") {
      this.advance(); // second -
      if (this.peek() === ">") {
        this.advance(); // >
        return { type: TokenType.DashedArrow, value: "-->", loc };
      }
      return { type: TokenType.Unknown, value: "--", loc };
    }
    if (this.peek() === ">") {
      this.advance(); // >
      return { type: TokenType.Arrow, value: "->", loc };
    }
    return { type: TokenType.Unknown, value: "-", loc };
  }

  /**
   * A non-ASCII character that starts no identifier, plus the word characters
   * after it, as one Unknown token (`😀A`), the way the `.krs` lexer reads it
   * (#3093), so a diagnostic covers what was written.
   */
  private readUnknown(loc: SourceLocation): Token {
    return { type: TokenType.Unknown, value: this.readWordTail(this.advance()), loc };
  }

  /** `head` (already consumed) plus the word characters after it. */
  private readWordTail(head: string): string {
    let value = head;
    let prev = head;
    for (let ch = wordPartAt(this.source, this.pos, prev); ch !== "";) {
      value += this.advance();
      prev = ch;
      ch = wordPartAt(this.source, this.pos, prev);
    }
    return value;
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
    let prev = "";
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
      if (ch === "." && isIdentStart(codePointAt(this.source, this.pos + 1))) {
        prev = this.advance();
        value += prev;
        continue;
      }
      // Letters, marks and digits in any script, and a joiner only where
      // `wordPartAt` allows one: the `.krs` lexer's rule, so a tag or id
      // written in the model is the same word here (#3140, TPL-2509).
      const part = ch === "-" ? ch : wordPartAt(this.source, this.pos, prev);
      if (part === "") break;
      prev = this.advance();
      value += prev;
    }
    return { type: TokenType.Identifier, value, loc };
  }

  private readValue(loc: SourceLocation): Token {
    let value = "";
    if (this.peek() === "-") value += this.advance();
    // Read number part (including decimal)
    while (this.pos < this.source.length && (isDigit(this.peek()) || this.peek() === ".")) {
      value += this.advance();
    }
    // Read optional unit suffix (px, %, em, etc.)
    while (this.pos < this.source.length && /[a-zA-Z%]/.test(this.peek())) {
      value += this.advance();
    }
    // A word that merely starts with a digit continues as a kebab name, the way
    // the `.krs` side reads a tag such as `[3d-secure]` or `[2026-q3]`: without
    // this, the selector stopped at `3d` and never matched the tag (#2849,
    // TPL-2509). No value with a unit is followed by a word character or by
    // `-<word>`, so `2px` / `1.5em` / `50%` end where they did.
    let prev = value.slice(-1);
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === "-" && isIdentPart(codePointAt(this.source, this.pos + 1))) {
        prev = this.advance();
        value += prev;
        continue;
      }
      const part = wordPartAt(this.source, this.pos, prev);
      if (part === "") break;
      prev = this.advance();
      value += prev;
    }
    return { type: TokenType.Identifier, value, loc };
  }
}

function isIdentStart(ch: string): boolean {
  return ch !== "" && isKrsIdentStart(ch);
}

function isIdentPart(ch: string): boolean {
  return ch !== "" && isKrsIdentPart(ch);
}

function isAscii(ch: string): boolean {
  return ch.length === 1 && ch.charCodeAt(0) <= 0x7f;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexChar(ch: string): boolean {
  return /[0-9a-fA-F]/.test(ch);
}
