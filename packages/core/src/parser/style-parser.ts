import { TokenType, type Token } from "../types/tokens.js";
import type { StyleSheet, StyleRule, StyleSelector } from "../types/style.js";
import type { Diagnostic, ParseResult } from "../types/ast.js";
import { StyleLexer } from "../lexer/style-lexer.js";

export class StyleParser {
  private tokens: Token[];
  private pos = 0;
  private diagnostics: Diagnostic[] = [];
  private ruleIndex = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  static parse(source: string): ParseResult<StyleSheet> {
    const tokens = new StyleLexer(source).tokenize();
    const parser = new StyleParser(tokens);
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
        message: `Expected ${type} but got ${token.type} ("${token.value}")`,
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

  parseStyleSheet(): ParseResult<StyleSheet> {
    const rules: StyleRule[] = [];

    while (this.peek().type !== TokenType.EOF) {
      const parsedRules = this.parseRuleSet();
      rules.push(...parsedRules);
    }

    return { value: { rules }, diagnostics: this.diagnostics };
  }

  private parseRuleSet(): StyleRule[] {
    const selectors = this.parseSelectorList();
    this.expect(TokenType.LeftBrace);

    const properties: Record<string, string> = {};
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      this.parseDeclaration(properties);
    }
    this.expect(TokenType.RightBrace);

    return selectors.map((selector) => ({
      selector,
      properties: { ...properties },
      specificity: computeSpecificity(selector),
      sourceIndex: this.ruleIndex++,
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
    const selector: StyleSelector = {
      tags: [],
      annotations: [],
    };

    // #id selector
    if (this.peek().type === TokenType.Hash) {
      this.advance(); // #
      selector.id = this.expect(TokenType.Identifier).value;
      return selector;
    }

    // Type selector (identifier like "service", "edge", "person")
    if (
      this.peek().type === TokenType.Identifier &&
      this.peek().value !== "{" &&
      !this.isPropertyLike()
    ) {
      selector.nodeType = this.advance().value;
    }

    // Tag selectors [tag]
    while (this.peek().type === TokenType.LeftBracket) {
      this.advance(); // [
      const tag = this.expect(TokenType.Identifier).value;
      this.expect(TokenType.RightBracket);
      selector.tags.push(tag);
    }

    // Annotation selectors @annotation
    while (this.peek().type === TokenType.At) {
      this.advance(); // @
      const annotation = this.expect(TokenType.Identifier).value;
      selector.annotations.push(annotation);
    }

    return selector;
  }

  private isPropertyLike(): boolean {
    // Look ahead: if we see identifier followed by colon, it's a property not a selector
    // This helps differentiate bare selectors from declarations
    let lookahead = 1;
    while (
      this.pos + lookahead < this.tokens.length &&
      this.tokens[this.pos + lookahead].type === TokenType.Identifier
    ) {
      lookahead++;
    }
    return false; // Selectors are always followed by { or , or [ or @
  }

  private parseDeclaration(properties: Record<string, string>): void {
    if (this.peek().type !== TokenType.Identifier) {
      this.diagnostics.push({
        severity: "error",
        message: `Expected property name but got ${this.peek().type}`,
      });
      this.advance();
      return;
    }

    const property = this.advance().value;
    this.expect(TokenType.Colon);

    const value = this.parseValue();
    properties[property] = value;

    this.match(TokenType.Semicolon);
  }

  private parseValue(): string {
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
        parts.push(this.advance().value);
      } else {
        parts.push(this.advance().value);
      }
    }

    return parts.join(" ").trim();
  }
}

export function computeSpecificity(selector: StyleSelector): number {
  let score = 0;
  if (selector.id) score += 100;
  score += selector.tags.length * 10;
  score += selector.annotations.length * 10;
  if (selector.nodeType) score += 1;
  return score;
}
