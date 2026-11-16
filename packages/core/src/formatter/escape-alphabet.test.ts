import { describe, it, expect } from "vitest";
import { escapeStringValue, quoteString } from "./quote-string.js";
import { quotedIdLiteral } from "./quote-id.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenType } from "../types/tokens.js";

// TPL-1101: the escapes the emitters write must be exactly the escapes the
// lexer decodes. Writing an escape the lexer does not decode corrupts the value
// (`\r` reads back as a bare `r`), and a lexer escape the emitters do not use
// for its character leaves that character to be decoded on the way back in.
//
// `quote-string.test.ts` checks hand-picked hostile values. This file checks
// the closed set instead: every UTF-16 code unit, alone and next to a
// backslash, through both emitters and back through `Lexer.readString`. Both
// sides are measured, not listed, so an escape added on one side only fails
// here.

/** Read the one string literal the lexer finds in `source`. */
function readLiteral(source: string): string {
  const tokens = new Lexer(source).tokenize();
  const literals = tokens.filter((t) => t.type === TokenType.StringLiteral);
  if (literals.length !== 1) {
    throw new Error(`expected one string literal in ${JSON.stringify(source)}`);
  }
  return literals[0].value;
}

/** Every UTF-16 code unit, lone surrogates included. */
const CODE_UNITS = Array.from({ length: 0x10000 }, (_, i) => String.fromCharCode(i));

/** Values that put each code unit beside a backslash, on either side. */
function valuesAround(ch: string): string[] {
  return [ch, `\\${ch}`, `${ch}\\`, `a${ch}b`];
}

const EMITTERS: Record<string, (value: string) => string> = {
  quoteString,
  quotedIdLiteral,
};

describe("emitted escapes round-trip through the lexer for every code unit (TPL-1101)", () => {
  for (const [name, emit] of Object.entries(EMITTERS)) {
    it(`${name} reads back every value unchanged`, () => {
      const broken: string[] = [];
      for (const ch of CODE_UNITS) {
        for (const value of valuesAround(ch)) {
          if (readLiteral(emit(value)) !== value) broken.push(JSON.stringify(value));
        }
      }
      expect(broken).toEqual([]);
    });
  }
});

describe("the escape sets of the emitter and the lexer are the same (TPL-1101)", () => {
  // `\\` and `\"` read back as the character after the backslash, so neither
  // side lists them here; the round trip above covers them.
  const SELF_ESCAPED = new Set(['"', "\\"]);

  /** Each `\X` the lexer reads back as something other than a bare `X`, to what it reads. */
  function measureLexerDecodes(): Map<string, string> {
    const decodes = new Map<string, string>();
    for (const ch of CODE_UNITS.filter((c) => !SELF_ESCAPED.has(c))) {
      const read = readLiteral(`"\\${ch}"`);
      if (read !== ch) decodes.set(`\\${ch}`, read);
    }
    return decodes;
  }

  /** Each character `escapeStringValue` does not write as itself, keyed by what it writes. */
  function measureEmitterEscapes(): Map<string, string> {
    const escapes = new Map<string, string>();
    for (const ch of CODE_UNITS.filter((c) => !SELF_ESCAPED.has(c))) {
      const out = escapeStringValue(ch);
      if (out !== ch) escapes.set(out, ch);
    }
    return escapes;
  }

  it("every escape the lexer decodes is the one the emitter writes for that character", () => {
    expect(measureEmitterEscapes()).toEqual(measureLexerDecodes());
  });
});
