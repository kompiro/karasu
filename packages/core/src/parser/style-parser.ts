import {
  TokenType,
  type Token,
  type SourceLocation,
  type SourceRange,
  type Trivia,
} from "../types/tokens.js";
import type { StyleSheet, StyleRule, StyleSelector, DeclarationTrivia } from "../types/style.js";
import type { Diagnostic, ParseResult } from "../types/ast.js";
import { StyleLexer } from "../lexer/style-lexer.js";

const ANONYMOUS_SHEET_ID = "<anonymous>";

export class StyleParser {
  private tokens: Token[];
  private pos = 0;
  private diagnostics: Diagnostic[] = [];
  private ruleIndex = 0;
  private sheetId: string;

  constructor(tokens: Token[], sheetId: string = ANONYMOUS_SHEET_ID) {
    this.tokens = tokens;
    this.sheetId = sheetId;
  }

  static parse(source: string, sheetId: string = ANONYMOUS_SHEET_ID): ParseResult<StyleSheet> {
    const tokens = new StyleLexer(source).tokenize();
    const parser = new StyleParser(tokens, sheetId);
    return parser.parseStyleSheet();
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
    const idx = this.pos + offset;
    if (idx < 0 || idx >= this.tokens.length) {
      return {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, column: 0, offset: 0 },
      };
    }
    return this.tokens[idx];
  }

  private advance(): Token {
    const token = this.peek();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      this.diagnostics.push({
        severity: "error",
        code: "style-token-type-mismatch",
        params: { expected: String(type), got: String(token.type), value: token.value },
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

  private rangeBetween(start: Token, end: Token): SourceRange {
    return { start: { ...start.loc }, end: this.endOfToken(end) };
  }

  private endOfToken(token: Token): SourceLocation {
    const len = token.value.length;
    return {
      line: token.loc.line,
      column: token.loc.column + len,
      offset: token.loc.offset + len,
    };
  }

  parseStyleSheet(): ParseResult<StyleSheet> {
    const rules: StyleRule[] = [];

    while (this.peek().type !== TokenType.EOF) {
      const parsedRules = this.parseRuleSet();
      rules.push(...parsedRules);
    }

    // Anything still attached to the EOF token (or trailing trivia of the
    // last rule's closing `}`) belongs at the sheet trailing trivia. The
    // last rule's `trailingTrivia` already absorbed same-line items; the
    // remainder is multi-line trivia that follows the file's last
    // construct.
    const trailingTrivia = takeLeadingTrivia(this.peek());

    return {
      value: { rules, sheetId: this.sheetId, trailingTrivia },
      diagnostics: this.diagnostics,
    };
  }

  private parseRuleSet(): StyleRule[] {
    const startToken = this.peek();
    const leadingTrivia = takeLeadingTrivia(startToken);
    const selectors = this.parseSelectorList();
    this.expect(TokenType.LeftBrace);

    const properties: Record<string, string> = {};
    const declarationLocs: Record<string, SourceRange> = {};
    const declarationTrivia: Record<string, DeclarationTrivia> = {};
    let lastDeclarationName: string | null = null;
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const beforePos = this.pos;
      const declName = this.parseDeclaration(
        properties,
        declarationLocs,
        declarationTrivia,
        lastDeclarationName,
      );
      if (declName) {
        lastDeclarationName = declName;
      } else if (this.pos === beforePos) {
        // Defensive: parseDeclaration always advances, but make sure we
        // never spin if it does not.
        this.advance();
      }
    }
    const closeToken = this.peek();
    // Trivia between the last `;` (or last decl tail) and `}`. Attach it to
    // the last declaration's trailing so comments tucked at end of rule
    // survive a Tidy round-trip.
    const beforeBrace = takeLeadingTrivia(closeToken);
    if (beforeBrace.length > 0 && lastDeclarationName) {
      const decl = declarationTrivia[lastDeclarationName] ?? { leading: [], trailing: [] };
      declarationTrivia[lastDeclarationName] = {
        leading: decl.leading,
        trailing: [...decl.trailing, ...beforeBrace],
      };
    }
    this.expect(TokenType.RightBrace);

    // Trivia immediately following `}`: split into same-line trailing of
    // this rule vs. multi-line leading of the next construct.
    const afterBrace = splitSameLineTrivia(this.peek(), closeToken.loc.line);
    const trailingTrivia = afterBrace.sameLine;

    const ruleLoc = this.rangeBetween(startToken, closeToken);
    return selectors.map((selector, idx) => ({
      selector,
      properties: { ...properties },
      specificity: computeSpecificity(selector),
      sourceIndex: this.ruleIndex++,
      loc: ruleLoc,
      declarationLocs: { ...declarationLocs },
      sheetId: this.sheetId,
      // Attach trivia only to the first emitted rule when a comma-list
      // expanded into multiple rules; subsequent rules get empty trivia
      // so the reformatter does not duplicate comments.
      leadingTrivia: idx === 0 ? leadingTrivia : [],
      trailingTrivia: idx === selectors.length - 1 ? trailingTrivia : [],
      declarationTrivia: idx === 0 ? { ...declarationTrivia } : {},
    }));
  }

  private parseSelectorList(): StyleSelector[] {
    const selectors: StyleSelector[] = [];
    selectors.push(this.parseSelector());

    while (this.peek().type === TokenType.Comma) {
      this.advance(); // ,
      selectors.push(this.parseSelector());
    }

    return selectors;
  }

  private parseSelector(): StyleSelector {
    const startToken = this.peek();
    const selector: StyleSelector = {
      tags: [],
      annotations: [],
      loc: this.rangeBetween(startToken, startToken),
    };

    // #id selector
    if (this.peek().type === TokenType.Hash) {
      this.advance(); // #
      const idToken = this.expect(TokenType.Identifier);
      selector.id = idToken.value;
      selector.loc = this.rangeBetween(startToken, idToken);
      return selector;
    }

    let lastToken = startToken;

    // Type selector (identifier like "service", "edge", "user")
    if (this.peek().type === TokenType.Identifier) {
      lastToken = this.advance();
      selector.nodeType = lastToken.value;
    }

    // edge#<id> selector — only meaningful after `edge`. Accepts either an
    // author identifier (`edge#criticalWrite`) or a base form
    // (`edge#A->B` / `edge#A-->B`).
    if (selector.nodeType === "edge" && this.peek().type === TokenType.Hash) {
      this.advance(); // #
      const first = this.expect(TokenType.Identifier);
      const next = this.peek().type;
      if (next === TokenType.Arrow || next === TokenType.DashedArrow) {
        const arrow = this.advance().value;
        const second = this.expect(TokenType.Identifier);
        selector.edgeId = `${first.value}${arrow}${second.value}`;
        lastToken = second;
      } else {
        selector.edgeId = first.value;
        lastToken = first;
      }
    }

    // Tag selectors [tag]
    while (this.peek().type === TokenType.LeftBracket) {
      this.advance(); // [
      const tag = this.expect(TokenType.Identifier);
      lastToken = this.expect(TokenType.RightBracket);
      selector.tags.push(tag.value);
    }

    // Annotation selectors @annotation
    while (this.peek().type === TokenType.At) {
      this.advance(); // @
      lastToken = this.expect(TokenType.Identifier);
      selector.annotations.push(lastToken.value);
    }

    selector.loc = this.rangeBetween(startToken, lastToken);
    return selector;
  }

  private parseDeclaration(
    properties: Record<string, string>,
    declarationLocs: Record<string, SourceRange>,
    declarationTrivia: Record<string, DeclarationTrivia>,
    previousDeclarationName: string | null,
  ): string | null {
    if (this.peek().type !== TokenType.Identifier) {
      this.diagnostics.push({
        severity: "error",
        code: "expected-style-property-name",
        params: { got: String(this.peek().type) },
      });
      this.advance();
      return null;
    }

    const propertyToken = this.peek();
    const leading = takeLeadingTrivia(propertyToken);
    this.advance();
    const property = propertyToken.value;
    this.expect(TokenType.Colon);

    const value = this.parseValue(property);
    properties[property] = value;

    const semicolonToken = this.peek().type === TokenType.Semicolon ? this.peek() : null;
    this.match(TokenType.Semicolon);
    declarationLocs[property] = this.rangeBetween(propertyToken, semicolonToken ?? this.peekAt(-1));

    // Trivia leading the *next* token may include line-comments that share
    // the same line as our `;` — those become this declaration's trailing.
    const boundaryLine = (semicolonToken ?? this.peekAt(-1)).loc.line;
    const split = splitSameLineTrivia(this.peek(), boundaryLine);

    declarationTrivia[property] = {
      leading,
      trailing: split.sameLine,
    };

    // Defensive — keep any pre-existing entry for the previous declaration
    // intact (they were already finalized when we parsed them).
    void previousDeclarationName;

    return property;
  }

  private parseValue(propertyName: string): string {
    const parts: string[] = [];

    while (
      this.peek().type !== TokenType.Semicolon &&
      this.peek().type !== TokenType.RightBrace &&
      this.peek().type !== TokenType.EOF
    ) {
      const token = this.peek();
      if (token.type === TokenType.StringLiteral) {
        parts.push(`"${this.advance().value}"`);
      } else if (token.type === TokenType.Identifier) {
        const ident = this.advance().value;
        // Check for function call like url(...)
        if (this.peek().type === TokenType.LeftParen) {
          this.advance(); // (
          let arg = "";
          while (this.peek().type !== TokenType.RightParen && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.StringLiteral) {
              arg = this.advance().value;
            } else {
              arg += this.advance().value;
            }
          }
          this.expect(TokenType.RightParen);
          parts.push(`${ident}("${arg}")`);
        } else {
          parts.push(ident);
        }
      } else if (token.type === TokenType.Comma) {
        // Recovery for the "comma instead of semicolon" mistake (#1168):
        // if the comma is immediately followed by `<identifier> :`, the user
        // most likely meant to terminate this declaration. Emit a diagnostic,
        // consume the comma as if it were a semicolon, and let the outer
        // declaration loop pick up the next property cleanly.
        if (
          this.peekAt(1).type === TokenType.Identifier &&
          this.peekAt(2).type === TokenType.Colon
        ) {
          this.diagnostics.push({
            severity: "error",
            code: "expected-semicolon-between-properties",
            params: { property: propertyName },
          });
          this.advance(); // consume the comma — treat as `;`
          break;
        }
        parts.push(this.advance().value);
      } else {
        parts.push(this.advance().value);
      }
    }

    return parts.join(" ").trim();
  }
}

/**
 * Consume the leading trivia attached to `token` and clear it on the token
 * so the same trivia is not visible to a later splitter call.
 */
function takeLeadingTrivia(token: Token): Trivia[] {
  const trivia = token.leadingTrivia ?? [];
  token.leadingTrivia = [];
  return trivia;
}

/**
 * Split `nextToken.leadingTrivia` into trivia that occurs on `boundaryLine`
 * (returned as `sameLine`) and the rest, which is left attached to the
 * token as its remaining `leadingTrivia`. The same-line slice is the
 * trailing trivia of whatever construct ended on `boundaryLine`.
 */
function splitSameLineTrivia(nextToken: Token, boundaryLine: number): { sameLine: Trivia[] } {
  const trivia = nextToken.leadingTrivia ?? [];
  if (trivia.length === 0) return { sameLine: [] };
  const sameLine: Trivia[] = [];
  const rest: Trivia[] = [];
  let stillSameLine = true;
  for (const t of trivia) {
    if (stillSameLine && t.kind !== "blank-line" && t.loc.start.line === boundaryLine) {
      sameLine.push(t);
    } else {
      stillSameLine = false;
      rest.push(t);
    }
  }
  nextToken.leadingTrivia = rest;
  return { sameLine };
}

export function computeSpecificity(selector: Omit<StyleSelector, "loc">): number {
  let score = 0;
  if (selector.id) score += 100;
  if (selector.edgeId) score += 100;
  score += selector.tags.length * 10;
  score += selector.annotations.length * 10;
  if (selector.nodeType) score += 1;
  return score;
}
