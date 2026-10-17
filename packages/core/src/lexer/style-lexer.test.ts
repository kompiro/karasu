import { describe, it, expect } from "vitest";
import { StyleLexer } from "./style-lexer.js";
import { TokenType } from "../types/tokens.js";

function values(source: string): string[] {
  return new StyleLexer(source)
    .tokenize()
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.value);
}

describe("StyleLexer — a sign before a number (#3032)", () => {
  // The `-` used to be read as a stray arrow start and dropped, so `-20px`
  // reached the parser as `20px` and every signed value lost its sign.
  it.each([
    ["-20px", "-20px"],
    ["-8", "-8"],
    ["-0.5", "-0.5"],
    ["-.5", "-.5"],
  ])("keeps the sign of %s", (source, expected) => {
    expect(values(source)).toEqual([expected]);
  });

  it("keeps the sign of the second length in a two-length value", () => {
    expect(values("label-offset: 0 -20px;")).toEqual(["label-offset", ":", "0", "-20px", ";"]);
  });

  it("still reads the arrows of an edge selector", () => {
    expect(values("edge#A->B")).toEqual(["edge", "#", "A", "->", "B"]);
    expect(values("edge#A --> B")).toEqual(["edge", "#", "A", "-->", "B"]);
  });

  it("still reads a hyphen inside a property name as part of the name", () => {
    expect(values("font-size: -12px;")).toEqual(["font-size", ":", "-12px", ";"]);
  });
});

// TPL-2707: a character the lexer drops never reaches the parser, so nothing
// can refuse it. The set is pinned exactly so a character that starts being
// dropped shows up here. A `-` is no longer dropped: one before a digit is part
// of the number (#3032), any other is an Unknown token (#3140).
describe("StyleLexer — the printable ASCII characters it drops", () => {
  it("drops exactly this set when the character stands alone", () => {
    const dropped: string[] = [];
    for (let code = 0x21; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      if (values(ch).length === 0) dropped.push(ch);
    }
    expect(dropped.join("")).toBe("!$%&'*+./<>?\\^`|~");
  });
});

// #3140: the `.krs.style` lexer drops nothing the `.krs` lexer keeps. Each
// non-ASCII code point is whitespace, part of a word, or an Unknown token.
describe("StyleLexer — characters outside ASCII (#3140)", () => {
  it("drops no non-ASCII code point", () => {
    // Every code point from U+0080 to U+10FFFF, one per source, unpaired
    // surrogates included: either skipped as whitespace, or covered by a
    // token whose value is that character.
    const dropped: string[] = [];
    for (let code = 0x80; code <= 0x10ffff; code++) {
      const ch = String.fromCodePoint(code);
      const tokens = new StyleLexer(ch).tokenize().filter((t) => t.type !== TokenType.EOF);
      const whitespace = /^(?:\p{White_Space}|﻿)$/u.test(ch);
      const covered = tokens.length === 1 && tokens[0].value === ch;
      if (whitespace ? tokens.length !== 0 : !covered) {
        dropped.push(`U+${code.toString(16).toUpperCase()}`);
      }
    }
    expect(dropped).toEqual([]);
  });

  it("reads a tag in any script as one identifier, as the .krs lexer does", () => {
    expect(values("[日本語]")).toEqual(["[", "日本語", "]"]);
    // Outside the BMP, and a decomposed `café` (combining mark).
    expect(values("[𠮷野家]")).toEqual(["[", "𠮷野家", "]"]);
    expect(values("[café-menu]")).toEqual(["[", "café-menu", "]"]);
    expect(values("#注文API")).toEqual(["#", "注文API"]);
  });

  it("reads a character that starts no word as one Unknown token with its word tail", () => {
    const tokens = new StyleLexer("[😀A]").tokenize();
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      [TokenType.LeftBracket, "["],
      [TokenType.Unknown, "😀A"],
      [TokenType.RightBracket, "]"],
      [TokenType.EOF, ""],
    ]);
  });

  it("reads Unicode whitespace and the byte order mark as whitespace", () => {
    for (const space of ["﻿", "　", " ", " "]) {
      expect([JSON.stringify(space), values(`a${space}b`)]).toEqual([
        JSON.stringify(space),
        ["a", "b"],
      ]);
    }
  });

  it("counts a character outside the BMP as two columns, like the .krs lexer", () => {
    const [first, second] = new StyleLexer("𠮷 x").tokenize();
    expect(first.loc.column).toBe(1);
    expect(second.loc.column).toBe(4);
  });
});

describe("StyleLexer — a hyphen that starts no number or arrow (#3140)", () => {
  it.each([
    ["- 20px", ["-", "20px"]],
    ["--20px", ["--", "20px"]],
    ["0 - 20px", ["0", "-", "20px"]],
  ])("keeps %s as an Unknown token instead of dropping it", (source, expected) => {
    const tokens = new StyleLexer(source).tokenize().filter((t) => t.type !== TokenType.EOF);
    expect(tokens.map((t) => t.value)).toEqual(expected);
    expect(tokens.some((t) => t.type === TokenType.Unknown)).toBe(true);
  });
});
