import { describe, it, expect } from "vitest";
import { Lexer, isBareWord } from "./lexer.js";
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

  it("tokenizes legend keywords", () => {
    const types = tokenTypes("legend swatch ref");
    expect(types).toEqual([TokenType.Legend, TokenType.Swatch, TokenType.Ref, TokenType.EOF]);
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

describe("words that start with a digit (#2707)", () => {
  it("reads a digit run as one Number token instead of dropping it", () => {
    expect(new Lexer("2026").tokenize().map((t) => [t.type, t.value])).toEqual([
      [TokenType.Number, "2026"],
      [TokenType.EOF, ""],
    ]);
  });

  it("keeps every part of a hyphenated date", () => {
    // Before #2707 this was `Identifier("-")` twice: the digits were gone.
    expect(tokenTypes("2026-12-31")).toEqual([
      TokenType.Number,
      TokenType.Identifier,
      TokenType.Number,
      TokenType.Identifier,
      TokenType.Number,
      TokenType.EOF,
    ]);
    expect(tokenValues("2026-12-31")).toEqual(["2026", "-", "12", "-", "31"]);
  });

  it("reads trailing letters into the same token", () => {
    // One token, so a diagnostic covers the whole word, and `abc` is not left
    // behind to be read as a plausible value.
    expect(tokenValues("2026abc")).toEqual(["2026abc"]);
    expect(tokenTypes("2026abc")[0]).toBe(TokenType.Number);
  });

  it("treats a non-ASCII digit as a digit", () => {
    expect(tokenTypes("２０２６")[0]).toBe(TokenType.Number);
  });

  it("still reads a digit inside a word as part of an identifier", () => {
    expect(new Lexer("Foo2").tokenize()[0]).toMatchObject({
      type: TokenType.Identifier,
      value: "Foo2",
    });
  });
});

describe("characters outside the BMP and combining marks (#2848)", () => {
  it("reads a word with a character outside the BMP as one identifier", () => {
    // Read one UTF-16 unit at a time, each half of the pair failed the letter
    // test and was dropped, so this was `野家`.
    expect(tokenValues("𠮷野家")).toEqual(["𠮷野家"]);
    expect(tokenValues("A𝟘")).toEqual(["A𝟘"]);
  });

  it("keeps a combining mark in the word it modifies", () => {
    // A decomposed `café` was recorded as `cafe`.
    expect(tokenValues("cafe\u0301")).toEqual(["cafe\u0301"]);
    // Devanagari vowel signs are marks; this word used to split into three.
    expect(tokenValues("हिन्दी")).toEqual(["हिन्दी"]);
  });

  it("does not start a word with a combining mark", () => {
    // A mark modifies the character before it. With none, it and the word
    // after it are one Unknown token that no position accepts (#3093).
    expect(new Lexer("\u0301A").tokenize()[0]).toMatchObject({
      type: TokenType.Unknown,
      value: "\u0301A",
    });
  });

  it("keeps offsets and columns in UTF-16 units", () => {
    const [, b] = new Lexer("𠮷 B").tokenize();
    expect(b.loc).toEqual({ line: 1, column: 4, offset: 3 });
    const [word] = new Lexer("𠮷野家 ").tokenize();
    expect(word.end).toEqual({ line: 1, column: 5, offset: 4 });
  });

  it("reads `@import` followed by a character outside the BMP as an annotation word", () => {
    // The `@import` lookahead reads words the way identifiers are read, so the
    // word is `import𠮷`, not the `@import` keyword followed by `𠮷`.
    expect(tokenTypes("@import𠮷")).toEqual([TokenType.At, TokenType.Identifier, TokenType.EOF]);
  });
});

describe("non-ASCII characters outside words (#3093)", () => {
  it("reads a symbol and the word after it as one Unknown token", () => {
    // One token, so a diagnostic covers what the author wrote and `A` is not
    // left behind to be read as a name.
    expect(new Lexer("😀A").tokenize().map((t) => [t.type, t.value])).toEqual([
      [TokenType.Unknown, "😀A"],
      [TokenType.EOF, ""],
    ]);
  });

  it("ends a word at the symbol", () => {
    expect(new Lexer("A😀B").tokenize().map((t) => [t.type, t.value])).toEqual([
      [TokenType.Identifier, "A"],
      [TokenType.Unknown, "😀B"],
      [TokenType.EOF, ""],
    ]);
  });

  it("reads a zero-width space as a symbol, not as whitespace", () => {
    expect(tokenTypes("Foo\u200BBar")).toEqual([
      TokenType.Identifier,
      TokenType.Unknown,
      TokenType.EOF,
    ]);
  });

  it("skips Unicode whitespace and the byte order mark", () => {
    for (const space of ["\uFEFF", "\u3000", "\u00A0", "\u2028", "\u2029", "\u202F"]) {
      expect([JSON.stringify(space), tokenValues(`a${space}b`)]).toEqual([
        JSON.stringify(space),
        ["a", "b"],
      ]);
    }
  });

  it("starts a new line only at LF, as LSP counts lines", () => {
    const [, b] = new Lexer("a\u2028b").tokenize();
    expect(b.loc).toEqual({ line: 1, column: 3, offset: 2 });
  });

  it("keeps ZWNJ and ZWJ inside a word but does not start one with them", () => {
    expect(tokenValues("\u0645\u06CC\u200C\u062E")).toEqual(["\u0645\u06CC\u200C\u062E"]);
    expect(tokenValues("\u0915\u094D\u200D\u0937")).toEqual(["\u0915\u094D\u200D\u0937"]);
    expect(new Lexer("\u200Ca").tokenize()[0].type).toBe(TokenType.Unknown);
  });
});

describe("isBareWord", () => {
  it("accepts what the lexer reads as one identifier word", () => {
    const values = [
      "legacy",
      "Legacy_2",
      "_x",
      "日本語",
      "system",
      "𠮷野家",
      "cafe\u0301",
      "हिन्दी",
      "\u0645\u06CC\u200C\u062E",
    ];
    expect(values.filter((value) => !isBareWord(value))).toEqual([]);
  });

  it("rejects anything the lexer would split, drop or read as another token", () => {
    const values = [
      "",
      "2legacy",
      "a-b",
      "a.b",
      "my legacy",
      "-",
      "#abc",
      "é!",
      "\u0301a",
      "a😀",
      "\u200Ca",
      "a\u200Bb",
    ];
    expect(values.filter((value) => isBareWord(value))).toEqual([]);
  });
});
