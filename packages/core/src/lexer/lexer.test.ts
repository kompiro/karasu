import { describe, it, expect } from "vitest";
import { Lexer } from "./lexer.js";
import { TokenType } from "../types/tokens.js";

function tokenTypes(source: string): TokenType[] {
  return new Lexer(source).tokenize().map((t) => t.type);
}

function tokenValues(source: string): string[] {
  return new Lexer(source)
    .tokenize()
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.value);
}

describe("Lexer", () => {
  it("tokenizes empty input", () => {
    expect(tokenTypes("")).toEqual([TokenType.EOF]);
  });

  it("tokenizes structural tokens", () => {
    expect(tokenTypes("{ } [ ] , ( )")).toEqual([
      TokenType.LeftBrace,
      TokenType.RightBrace,
      TokenType.LeftBracket,
      TokenType.RightBracket,
      TokenType.Comma,
      TokenType.LeftParen,
      TokenType.RightParen,
      TokenType.EOF,
    ]);
  });

  it("tokenizes keywords", () => {
    const types = tokenTypes("system service domain usecase resource user");
    expect(types).toEqual([
      TokenType.System,
      TokenType.Service,
      TokenType.Domain,
      TokenType.Usecase,
      TokenType.Resource,
      TokenType.User,
      TokenType.EOF,
    ]);
  });

  it("tokenizes deploy keywords", () => {
    const types = tokenTypes("deploy war jar oci lambda function assets job artifact");
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
      TokenType.EOF,
    ]);
  });

  it("tokenizes property keywords", () => {
    const types = tokenTypes("runtime realizes schedule image type role team link");
    expect(types).toEqual([
      TokenType.Runtime,
      TokenType.Realizes,
      TokenType.Schedule,
      TokenType.Image,
      TokenType.Type,
      TokenType.Role,
      TokenType.Team,
      TokenType.Link,
      TokenType.EOF,
    ]);
  });

  it("tokenizes logical property keywords", () => {
    const types = tokenTypes("label description team link role");
    expect(types).toEqual([
      TokenType.Label,
      TokenType.Description,
      TokenType.Team,
      TokenType.Link,
      TokenType.Role,
      TokenType.EOF,
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
    expect(tokenTypes("-> -->")).toEqual([TokenType.Arrow, TokenType.DashedArrow, TokenType.EOF]);
  });

  it("tokenizes @import", () => {
    const tokens = new Lexer('@import "default.krs.style"').tokenize();
    expect(tokens[0].type).toBe(TokenType.AtImport);
    expect(tokens[1].type).toBe(TokenType.StringLiteral);
    expect(tokens[1].value).toBe("default.krs.style");
  });

  it("tokenizes annotations", () => {
    const types = tokenTypes("@deprecated @new");
    expect(types).toEqual([
      TokenType.At,
      TokenType.Identifier,
      TokenType.At,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("tokenizes import declaration", () => {
    const types = tokenTypes('import { ECommerce } from "ec.krs"');
    expect(types).toEqual([
      TokenType.Import,
      TokenType.LeftBrace,
      TokenType.Identifier,
      TokenType.RightBrace,
      TokenType.From,
      TokenType.StringLiteral,
      TokenType.EOF,
    ]);
  });

  it("skips line comments", () => {
    const values = tokenValues('system // this is a comment\n"label"');
    expect(values).toEqual(["system", "label"]);
  });

  it("skips block comments", () => {
    const values = tokenValues("system /* block\ncomment */ service");
    expect(values).toEqual(["system", "service"]);
  });

  it("tracks source locations", () => {
    const tokens = new Lexer('system "test"').tokenize();
    expect(tokens[0].loc).toEqual({ line: 1, column: 1, offset: 0 });
    expect(tokens[1].loc).toEqual({ line: 1, column: 8, offset: 7 });
  });

  it("tokenizes a complete system block", () => {
    const source = `
system "ECプラットフォーム" {
  user Customer "顧客" {
    description "商品を購入する一般ユーザー"
  }
  service ECommerce "ECサイト" [external] @deprecated
  Customer -> ECommerce "商品を購入する"
  Customer --> ECommerce "非同期処理"
}`;
    const types = tokenTypes(source).filter((t) => t !== TokenType.EOF);
    expect(types).toEqual([
      TokenType.System,
      TokenType.StringLiteral,
      TokenType.LeftBrace,
      TokenType.User,
      TokenType.Identifier, // Customer
      TokenType.StringLiteral,
      TokenType.LeftBrace,
      TokenType.Description,
      TokenType.StringLiteral,
      TokenType.RightBrace,
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
      TokenType.RightBrace,
    ]);
  });

  it("tokenizes triple-quoted string", () => {
    const source = `description """\n  line1\n  line2\n  """`;
    const tokens = new Lexer(source).tokenize();
    expect(tokens[0].type).toBe(TokenType.Description);
    expect(tokens[1].type).toBe(TokenType.TripleQuote);
  });

  it("dedents triple-quoted string based on closing indent", () => {
    const source = `description """\n    line1\n    line2\n    """`;
    const tokens = new Lexer(source).tokenize();
    expect(tokens[1].type).toBe(TokenType.TripleQuote);
    expect(tokens[1].value).toBe("line1\nline2");
  });

  it("handles triple-quoted string with mixed indentation", () => {
    const source = `description """\n    first\n      indented\n    """`;
    const tokens = new Lexer(source).tokenize();
    expect(tokens[1].value).toBe("first\n  indented");
  });
});
