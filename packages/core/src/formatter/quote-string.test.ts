import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  escapeStringValue,
  quoteString,
  canUseTripleQuote,
  emitDescription,
} from "./quote-string.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenType } from "../types/tokens.js";

/** Round-trip a value through the lexer as a quoted literal. */
function relex(value: string): string {
  const tokens = new Lexer(quoteString(value)).tokenize();
  const str = tokens.find((t) => t.type === TokenType.StringLiteral);
  if (!str) throw new Error(`no string literal produced for ${JSON.stringify(value)}`);
  return str.value;
}

// Values chosen to hit each escape rule and the ones deliberately left raw.
const HOSTILE_VALUES: Record<string, string> = {
  "embedded double quote": 'say "hi"',
  "embedded backslash": "C:\\path\\to",
  "trailing backslash": "ends with \\",
  "backslash before quote": 'tricky \\" sequence',
  "escape-looking text": "not \\n a newline",
  "embedded newline": "line one\nline two",
  "triple quote": 'contains """ inside',
  "carriage return": "cr\rhere",
  "only a quote": '"',
  "empty string": "",
  unicode: "日本語 — em dash",
};

describe("escapeStringValue / quoteString", () => {
  for (const [name, value] of Object.entries(HOSTILE_VALUES)) {
    it(`round-trips through the lexer: ${name}`, () => {
      expect(relex(value)).toBe(value);
    });
  }

  it("escapes backslash before quote so the quote does not become an escape", () => {
    // Naive ordering (quote first, then backslash) would double-escape and
    // corrupt the value — this pins the ordering in escapeStringValue.
    expect(escapeStringValue('a\\"b')).toBe('a\\\\\\"b');
    expect(relex('a\\"b')).toBe('a\\"b');
  });

  it("escapes a literal newline rather than emitting it raw", () => {
    // Raw would survive a re-parse but break the one-property-per-line output.
    expect(quoteString("a\nb")).toBe('"a\\nb"');
    expect(quoteString("a\nb")).not.toContain("\n");
  });

  it("leaves characters with no lexer escape raw", () => {
    // The lexer decodes an unknown \X as bare X, so escaping \r would round-trip
    // as a literal "r". Raw is the only faithful option.
    expect(quoteString("cr\rhere")).toBe('"cr\rhere"');
  });
});

describe("canUseTripleQuote / emitDescription", () => {
  it("rejects a body containing the terminator", () => {
    expect(canUseTripleQuote("plain\nbody")).toBe(true);
    expect(canUseTripleQuote('has """ inside')).toBe(false);
  });

  it("uses a triple-quote block for a safe multi-line body", () => {
    const out = emitDescription("first\nsecond", "  ");
    expect(out).toBe('  description """\n    first\n    second\n    """');
  });

  it("falls back to the single-line form when the body contains the terminator", () => {
    const out = emitDescription('a\n"""\nb', "  ");
    expect(out).not.toContain('description """');
    expect(out).toContain("\\n");
  });

  it("uses the single-line form for a body with no newline", () => {
    expect(emitDescription("short", "  ")).toBe('  description "short"');
  });
});

// Structural guard (#2087, mirroring the #2076 top-level coverage guard).
//
// Every string value the formatter emits must go through quoteString/quoteId.
// A raw `"${...}"` interpolation is exactly the defect this issue fixed: it
// looks correct and silently produces unparseable output the moment a value
// contains a quote. Enumerating the ~24 emit sites in a test would drift the
// same way the emit list did in #2076, so assert the *absence of the pattern*
// instead — that catches the next emit site added without escaping.
describe("formatter emits no unescaped string values", () => {
  it('contains no raw "${...}" interpolation', () => {
    const source = readFileSync(fileURLToPath(new URL("./formatter.ts", import.meta.url)), "utf8");
    const offenders = source
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /"\$\{/.test(line));

    expect(offenders).toEqual([]);
  });
});
