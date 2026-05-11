import {
  TokenType,
  type Token,
  type SourceLocation,
  type SourceRange,
  type Trivia,
} from "../types/tokens.js";
import type {
  StyleSheet,
  StyleRule,
  StyleSelector,
  DeclarationTrivia,
  ValueNode,
} from "../types/style.js";
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
    const valueNodes: Record<string, ValueNode> = {};
    let lastDeclarationName: string | null = null;
    while (this.peek().type !== TokenType.RightBrace && this.peek().type !== TokenType.EOF) {
      const beforePos = this.pos;
      const declName = this.parseDeclaration(
        properties,
        declarationLocs,
        declarationTrivia,
        valueNodes,
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
      valueNodes: { ...valueNodes },
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
    valueNodes: Record<string, ValueNode>,
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

    const valueResult = this.parseValue(property);
    properties[property] = valueResult.text;
    if (valueResult.node) {
      valueNodes[property] = valueResult.node;
    }

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

  /**
   * Parse a property value into both its joined-string form (canonical for
   * resolver / Tidy / svg-builder) and a structured `ValueNode` (used by
   * the validator pass added in Phase 3 / PR-B). Both consume the same
   * tokens, so they are produced together to avoid re-parsing.
   *
   * Returns `node: undefined` when the value is empty (no atoms before
   * `;` / `}`) or every atom failed to classify; in that case only the
   * joined string is meaningful and the validator pass will skip it.
   */
  private parseValue(propertyName: string): { text: string; node: ValueNode | undefined } {
    const parts: string[] = [];
    const atoms: ValueNode[] = [];
    const segmentStarts: number[] = [0]; // indices into `atoms` where each comma-separated segment starts

    while (
      this.peek().type !== TokenType.Semicolon &&
      this.peek().type !== TokenType.RightBrace &&
      this.peek().type !== TokenType.EOF
    ) {
      const token = this.peek();
      if (token.type === TokenType.StringLiteral) {
        const t = this.advance();
        parts.push(`"${t.value}"`);
        atoms.push({
          kind: "string",
          value: t.value,
          loc: tokenLoc(t),
        });
      } else if (token.type === TokenType.Identifier) {
        const t = this.advance();
        const ident = t.value;
        // Function call like url("...")
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
          const close = this.peek().type === TokenType.RightParen ? this.peek() : null;
          this.expect(TokenType.RightParen);
          parts.push(`${ident}("${arg}")`);
          atoms.push({
            kind: "function",
            name: ident,
            argRaw: arg,
            loc: rangeBetweenTokens(t, close ?? t),
          });
        } else {
          parts.push(ident);
          atoms.push(classifyIdentAtom(ident, t));
        }
      } else if (token.type === TokenType.Comma) {
        // Recovery for "comma instead of semicolon" (#1168): if the
        // comma is immediately followed by `<identifier> :`, the user
        // most likely meant `;`. Emit a diagnostic and treat the comma
        // as a terminator.
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
        // Legitimate comma — start a new segment for the list builder.
        parts.push(this.advance().value);
        segmentStarts.push(atoms.length);
      } else {
        // Unknown / unhandled token — keep it in the joined string but
        // do not attempt to classify into a ValueNode.
        parts.push(this.advance().value);
      }
    }

    const text = parts.join(" ").trim();
    const node = buildValueNode(atoms, segmentStarts);
    return { text, node };
  }
}

/**
 * Classify a bare identifier atom. Hex tokens land here too because the
 * lexer emits them as `Identifier` with a leading `#` (see style-lexer
 * `readHexColor`). Numeric values (`12`, `12px`, `0.5`) similarly come
 * through as `Identifier`.
 */
function classifyIdentAtom(value: string, token: Token): ValueNode {
  if (value.startsWith("#")) {
    return { kind: "hex", value, loc: tokenLoc(token) };
  }
  const numericMatch = /^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/.exec(value);
  if (numericMatch) {
    const numeric = Number.parseFloat(numericMatch[1]);
    const unit = numericMatch[2];
    if (unit) {
      return {
        kind: "length",
        value: numeric,
        unit,
        raw: numericMatch[1],
        loc: tokenLoc(token),
      };
    }
    return {
      kind: "number",
      value: numeric,
      raw: numericMatch[1],
      loc: tokenLoc(token),
    };
  }
  return { kind: "ident", value, loc: tokenLoc(token) };
}

function buildValueNode(atoms: ValueNode[], segmentStarts: number[]): ValueNode | undefined {
  if (atoms.length === 0) return undefined;
  if (segmentStarts.length <= 1) {
    // No commas — single segment. If exactly one atom, return it; if
    // multiple atoms (e.g. a sequence the parser does not recognize),
    // leave node undefined for now and let the validator skip.
    return atoms.length === 1 ? atoms[0] : undefined;
  }
  // Comma-separated list. Each segment becomes one item: a single atom
  // when the segment has exactly one, and `undefined` (skipped) otherwise.
  const items: ValueNode[] = [];
  for (let i = 0; i < segmentStarts.length; i++) {
    const start = segmentStarts[i];
    const end = i + 1 < segmentStarts.length ? segmentStarts[i + 1] : atoms.length;
    if (end - start === 1) {
      items.push(atoms[start]);
    } else if (end - start > 1) {
      // Multi-atom segment — fold by using the first atom's loc as a
      // placeholder. The validator can still report on the segment but
      // cannot zoom into a sub-atom.
      items.push(atoms[start]);
    }
  }
  if (items.length === 0) return undefined;
  return {
    kind: "list",
    items,
    loc: {
      start: items[0].loc.start,
      end: items[items.length - 1].loc.end,
    },
  };
}

function tokenLoc(token: Token): SourceRange {
  const len = token.value.length;
  return {
    start: { ...token.loc },
    end: {
      line: token.loc.line,
      column: token.loc.column + len,
      offset: token.loc.offset + len,
    },
  };
}

function rangeBetweenTokens(start: Token, end: Token): SourceRange {
  const len = end.value.length;
  return {
    start: { ...start.loc },
    end: {
      line: end.loc.line,
      column: end.loc.column + len,
      offset: end.loc.offset + len,
    },
  };
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
