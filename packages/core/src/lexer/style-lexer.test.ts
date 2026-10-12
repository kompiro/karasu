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
// dropped shows up here. A `-` alone is still dropped; one before a digit is not.
describe("StyleLexer — the printable ASCII characters it drops", () => {
  it("drops exactly this set when the character stands alone", () => {
    const dropped: string[] = [];
    for (let code = 0x21; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      if (values(ch).length === 0) dropped.push(ch);
    }
    expect(dropped.join("")).toBe("!$%&'*+-./<>?\\^`|~");
  });
});
