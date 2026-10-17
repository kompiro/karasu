import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { StyleParser } from "../parser/style-parser.js";

// #3140: the style lexer dropped a `-` that starts no number or arrow, and
// every non-ASCII character, so the parser never saw them and nothing could
// refuse them (TPL-2707). `label-offset: - 20px` applied as `20px`, and a
// selector naming a non-ASCII id or facet never matched. These tests start
// from sheet text, like `style-sheet-signed-values.test.ts`.

const MODEL = `
facet 個人情報 {
  label "PII"
}
system S {
  service 注文 {
    label "A"
    facets 個人情報
  }
  service B {
    label "B"
  }
  注文 -> B "calls"
}
`;

/** `[x, y]` of the edge label's `<text>`, and the style sheet's errors. */
function render(styleSource?: string): { at: [number, number]; errors: string[]; svg: string } {
  const result = compile(MODEL, styleSource === undefined ? {} : { styleSource });
  const match = /<text\b[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"[^>]*>calls<\/text>/.exec(
    result.svg,
  );
  if (!match) throw new Error("edge label <text> not found");
  const errors = result.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.code} ${JSON.stringify(d.params)}`);
  return { at: [Number(match[1]), Number(match[2])], errors, svg: result.svg };
}

describe("characters the style lexer used to drop (#3140)", () => {
  const plain = render();

  it.each(["- 20px", "--20px", "0 - 20px"])(
    "refuses label-offset: %s with an error instead of applying 20px",
    (value) => {
      const { at, errors } = render(`edge { label-offset: ${value}; }`);
      expect(errors.some((e) => e.startsWith("style-token-type-mismatch"))).toBe(true);
      // The declaration takes no effect: the label stays where it was.
      expect(at).toEqual(plain.at);
    },
  );

  it("refuses a function argument holding a character that starts no word", () => {
    const sheet = StyleParser.parse("service { shape: url(😀A); }");
    expect(sheet.diagnostics.map((d) => d.code)).toEqual(["style-token-type-mismatch"]);
    expect(sheet.value.rules[0].properties).not.toHaveProperty("shape");
  });

  it("still applies a signed label-offset", () => {
    const { at, errors } = render("edge { label-offset: -20px; }");
    expect(errors).toEqual([]);
    expect(at).toEqual([plain.at[0], plain.at[1] - 20]);
  });

  it.each(["#注文", "[facets=個人情報]"])(
    "matches a node through the non-ASCII selector %s",
    (selector) => {
      const { svg, errors } = render(`${selector} { border-color: #ff0000; }`);
      expect(errors).toEqual([]);
      expect(svg).toContain('stroke="#ff0000"');
      expect(plain.svg).not.toContain('stroke="#ff0000"');
    },
  );

  it("reads a non-ASCII tag selector as that tag, not as `]`", () => {
    const sheet = StyleParser.parse("[日本語] { border-color: #ff0000; }");
    expect(sheet.diagnostics).toEqual([]);
    expect(sheet.value.rules[0].selector.tags).toEqual(["日本語"]);
  });

  it("reports a selector character that starts no word", () => {
    const { errors } = render("[😀] { border-color: #ff0000; }");
    expect(errors.some((e) => e.includes('"got":"Unknown"'))).toBe(true);
  });
});
