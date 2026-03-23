import { describe, it, expect } from "vitest";
import { Lexer } from "./lexer.js";
import { TokenType } from "../types/tokens.js";

/** Extract token types (excluding Newline for readability in most tests) */
function tokenTypes(source: string): TokenType[] {
  return new Lexer(source).tokenize().map((t) => t.type);
}

/** Extract token types, filtering out Newline and EOF for concise assertions */
function significantTypes(source: string): TokenType[] {
  return new Lexer(source)
    .tokenize()
    .filter((t) => t.type !== TokenType.Newline && t.type !== TokenType.EOF)
    .map((t) => t.type);
}

/** Extract non-structural token values */
function tokenValues(source: string): string[] {
  return new Lexer(source)
    .tokenize()
    .filter(
      (t) =>
        t.type !== TokenType.EOF &&
        t.type !== TokenType.Newline &&
        t.type !== TokenType.Indent &&
        t.type !== TokenType.Dedent,
    )
    .map((t) => t.value);
}

describe("Lexer", () => {
  it("tokenizes empty input", () => {
    expect(tokenTypes("")).toEqual([TokenType.EOF]);
  });

  it("tokenizes single-line declaration", () => {
    expect(significantTypes('system "Test"')).toEqual([TokenType.System, TokenType.StringLiteral]);
  });

  it("tokenizes colon for block start", () => {
    expect(significantTypes('system "Test":')).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
    ]);
  });

  it("generates INDENT and DEDENT for indented block", () => {
    const source = 'system "Test":\n  service S "S"';
    expect(significantTypes(source)).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
      TokenType.Dedent,
    ]);
  });

  it("generates multiple DEDENTs when dedenting several levels", () => {
    const source = ['system "S":', "  service S1 \"S1\":", "    domain \"D\":", "      usecase \"U\"", "service S2 \"S2\""].join(
      "\n",
    );
    const types = significantTypes(source);
    // After usecase "U", we go from indent 6 back to 0 → 3 DEDENTs
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Domain,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Usecase,
      TokenType.StringLiteral,
      TokenType.Dedent,
      TokenType.Dedent,
      TokenType.Dedent,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
    ]);
  });

  it("tokenizes keywords", () => {
    const types = significantTypes("system service domain usecase resource user");
    expect(types).toEqual([
      TokenType.System,
      TokenType.Service,
      TokenType.Domain,
      TokenType.Usecase,
      TokenType.Resource,
      TokenType.User,
    ]);
  });

  it("tokenizes deploy keywords", () => {
    const types = significantTypes("deploy war jar oci lambda function assets job artifact");
    expect(types).toEqual([
      TokenType.Deploy,
      TokenType.War,
      TokenType.Jar,
      TokenType.Oci,
      TokenType.Lambda,
      TokenType.Function,
      TokenType.Assets,
      TokenType.Job,
      TokenType.Artifact,
    ]);
  });

  it("tokenizes property keywords including links", () => {
    const types = significantTypes("description team link links role");
    expect(types).toEqual([
      TokenType.Description,
      TokenType.Team,
      TokenType.Link,
      TokenType.Links,
      TokenType.Role,
    ]);
  });

  it("tokenizes string literals", () => {
    const values = tokenValues('"hello" "world"');
    expect(values).toEqual(["hello", "world"]);
  });

  it("handles escaped characters in strings", () => {
    const values = tokenValues('"say \\"hi\\"" "back\\\\slash"');
    expect(values).toEqual(['say "hi"', "back\\slash"]);
  });

  it("tokenizes arrows", () => {
    expect(significantTypes("-> -->")).toEqual([TokenType.Arrow, TokenType.DashedArrow]);
  });

  it("tokenizes dash as list item marker", () => {
    expect(significantTypes('- "url"')).toEqual([TokenType.Dash, TokenType.StringLiteral]);
  });

  it("tokenizes @import", () => {
    const tokens = new Lexer('@import "default.krs.style"').tokenize();
    expect(tokens[0].type).toBe(TokenType.AtImport);
    expect(tokens[1].type).toBe(TokenType.StringLiteral);
    expect(tokens[1].value).toBe("default.krs.style");
  });

  it("tokenizes annotations", () => {
    expect(significantTypes("@deprecated @new")).toEqual([
      TokenType.At,
      TokenType.Identifier,
      TokenType.At,
      TokenType.Identifier,
    ]);
  });

  it("tokenizes import declaration with braces", () => {
    const types = significantTypes('import { ECommerce } from "ec.krs"');
    expect(types).toEqual([
      TokenType.Import,
      TokenType.LeftBrace,
      TokenType.Identifier,
      TokenType.RightBrace,
      TokenType.From,
      TokenType.StringLiteral,
    ]);
  });

  it("tokenizes pipe for multi-line description", () => {
    const source = 'system "S":\n  description: |\n    line1\n    line2';
    const tokens = new Lexer(source)
      .tokenize()
      .filter((t) => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Description,
      TokenType.Colon,
      TokenType.Pipe,
      TokenType.StringLiteral, // collected pipe block text
      TokenType.Dedent,
    ]);
    const strToken = tokens.find((t) => t.type === TokenType.StringLiteral && t.value.includes("line"));
    expect(strToken?.value).toBe("line1\nline2");
  });

  it("pipe block preserves relative indentation", () => {
    const source = 'description: |\n  first\n    indented\n  back';
    // At top level, pipe block indent = 0, content starts at indent 2
    const tokens = new Lexer(source).tokenize();
    const str = tokens.find((t) => t.type === TokenType.StringLiteral && t.value.includes("first"));
    expect(str?.value).toBe("first\n  indented\nback");
  });

  it("pipe block preserves blank lines", () => {
    const source = 'description: |\n  line1\n\n  line2';
    const tokens = new Lexer(source).tokenize();
    const str = tokens.find((t) => t.type === TokenType.StringLiteral && t.value.includes("line1"));
    expect(str?.value).toBe("line1\n\nline2");
  });

  it("skips line comments without affecting indentation", () => {
    const source = 'system "S":\n  // comment\n  service S "S"';
    const types = significantTypes(source);
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
      TokenType.Dedent,
    ]);
  });

  it("skips blank lines without affecting indentation", () => {
    const source = 'system "S":\n  service S1 "S1"\n\n  service S2 "S2"';
    const types = significantTypes(source);
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
      TokenType.Service,
      TokenType.Identifier,
      TokenType.StringLiteral,
      TokenType.Dedent,
    ]);
  });

  it("skips block comments", () => {
    const values = tokenValues("system /* block\ncomment */ service");
    expect(values).toContain("system");
    expect(values).toContain("service");
  });

  it("tracks source locations", () => {
    const tokens = new Lexer('system "test"').tokenize();
    expect(tokens[0].loc).toEqual({ line: 1, column: 1, offset: 0 });
    expect(tokens[1].loc).toEqual({ line: 1, column: 8, offset: 7 });
  });

  it("tokenizes a complete YAML-style system block", () => {
    const source = [
      'system "ECプラットフォーム":',
      '  user Customer "顧客":',
      '    description: "商品を購入する一般ユーザー"',
      '  service ECommerce "ECサイト" [external] @deprecated',
      '  Customer -> ECommerce "商品を購入する"',
      '  Customer --> ECommerce "非同期処理"',
    ].join("\n");
    const types = significantTypes(source);
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.User,
      TokenType.Identifier, // Customer
      TokenType.StringLiteral,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Description,
      TokenType.Colon,
      TokenType.StringLiteral,
      TokenType.Dedent,
      TokenType.Service,
      TokenType.Identifier, // ECommerce
      TokenType.StringLiteral,
      TokenType.LeftBracket,
      TokenType.Identifier, // external
      TokenType.RightBracket,
      TokenType.At,
      TokenType.Identifier, // deprecated
      TokenType.Identifier, // Customer
      TokenType.Arrow,
      TokenType.Identifier, // ECommerce
      TokenType.StringLiteral,
      TokenType.Identifier, // Customer
      TokenType.DashedArrow,
      TokenType.Identifier, // ECommerce
      TokenType.StringLiteral,
      TokenType.Dedent,
    ]);
  });

  it("tokenizes links with dash list items", () => {
    const source = ['links:', '  - "https://example.com"', '  - "https://other.com"'].join("\n");
    const types = significantTypes(source);
    expect(types).toEqual([
      TokenType.Links,
      TokenType.Colon,
      TokenType.Indent,
      TokenType.Dash,
      TokenType.StringLiteral,
      TokenType.Dash,
      TokenType.StringLiteral,
      TokenType.Dedent,
    ]);
  });

  describe("diagnostics", () => {
    it("reports tab indentation as error", () => {
      const result = new Lexer("\tservice S \"S\"").tokenizeWithDiagnostics();
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].message).toContain("Tabs");
    });

    it("reports inconsistent indentation", () => {
      const source = 'system "S":\n  service S1 "S1":\n     domain "D"'; // 5 spaces instead of 4
      const result = new Lexer(source).tokenizeWithDiagnostics();
      const indentErrors = result.diagnostics.filter((d) => d.message.includes("Inconsistent"));
      expect(indentErrors.length).toBeGreaterThan(0);
    });
  });
});
