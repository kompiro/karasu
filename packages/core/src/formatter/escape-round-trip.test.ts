import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";

// End-to-end escaping round-trips (#2087).
//
// quote-string.test.ts pins the escaping rules in isolation; this file checks
// that every construct carrying a string value actually routes through them.
// The value below exercises all three lexer escapes at once plus a character
// with no escape, so a site that forgets to escape produces a parse error.
const HOSTILE = String.raw`say \"hi\" \\ and \n`;

/** Parse, format, re-parse; assert no errors and structural equality. */
function expectRoundTrip(src: string): void {
  const before = Parser.parse(src);
  expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  const formatted = format(src);
  const after = Parser.parse(formatted);
  expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  expect(stripLocations(after.value)).toEqual(stripLocations(before.value));
  // Idempotent, so the escaping does not grow a backslash on every run.
  expect(format(formatted)).toBe(formatted);
}

const CASES: Record<string, string> = {
  "node label": `service A { label "${HOSTILE}" }`,
  "single-line description": `service A { description "${HOSTILE}" }`,
  "multi-line description": `service A {\n  description """\n    first ${HOSTILE}\n    second line\n  """\n}`,
  "user role": `system S {\n  user U { role "${HOSTILE}" }\n}`,
  "link url and label": `service A {\n  link "https://ex.com/?q=${HOSTILE}" "${HOSTILE}"\n}`,
  "edge label": `system S {\n  service A { label "A" }\n  service B { label "B" }\n  A -> B "${HOSTILE}"\n}`,
  "deploy unit properties": `deploy P {\n  oci "${HOSTILE}" {\n    runtime "${HOSTILE}"\n    image "${HOSTILE}"\n  }\n}`,
  "deploy schedule": `deploy P {\n  job "j" {\n    schedule "${HOSTILE}"\n  }\n}`,
  "organization and team label": `organization O {\n  label "${HOSTILE}"\n  team T { label "${HOSTILE}" }\n}`,
  "member slack and github": `organization O {\n  team T {\n    member M {\n      label "${HOSTILE}"\n      slack "${HOSTILE}"\n      github "${HOSTILE}"\n    }\n  }\n}`,
  "boundary label": `system S {\n  service A { label "A" }\n}\nboundary g {\n  label "${HOSTILE}"\n  contains A\n}`,
  "legend title and entry labels": `system S {\n  service A { label "A" }\n}\nlegend "${HOSTILE}" {\n  swatch #ff0000 "${HOSTILE}"\n  ref @deprecated "${HOSTILE}"\n}`,
  "import path": `import { A } from "./weird ${HOSTILE}.krs"\nsystem S {}`,
  "style import path": `@import "./weird ${HOSTILE}.krs.style"\nsystem S {}`,
};

describe("string values with escapes round-trip through format()", () => {
  for (const [name, src] of Object.entries(CASES)) {
    it(`escapes in ${name}`, () => {
      expectRoundTrip(src);
    });
  }

  it("preserves the decoded value, not the escaped text", () => {
    const src = `service A { label "say \\"hi\\"" }`;
    const before = Parser.parse(src).value.services[0].label;
    const after = Parser.parse(format(src)).value.services[0].label;
    expect(before).toBe('say "hi"');
    expect(after).toBe('say "hi"');
  });

  it("does not grow backslashes across repeated formatting", () => {
    // The classic escaping regression: each pass re-escapes the previous pass.
    const src = `service A { label "back\\\\slash" }`;
    let out = format(src);
    for (let i = 0; i < 5; i++) out = format(out);
    expect(Parser.parse(out).value.services[0].label).toBe("back\\slash");
  });

  it("falls back from a triple-quote block when the body contains the terminator", () => {
    // A `"""` body cannot itself contain `"""` (the block would end early), so
    // such a value only reaches the formatter via the escaped single-line form
    // — or from a merged/translated AST. Either way the formatter must not
    // promote it to a block that terminates early.
    const src = `service A { description "before\\n\\"\\"\\"\\nafter" }`;
    const parsed = Parser.parse(src);
    expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const value = parsed.value.services[0].properties.description;
    expect(value).toContain('"""');
    expect(value).toContain("\n");

    const formatted = format(src);
    expect(formatted).not.toContain('description """');
    expectRoundTrip(src);
  });
});

function stripLocations<T>(node: T): T {
  if (Array.isArray(node)) return node.map((item) => stripLocations(item)) as unknown as T;
  if (node instanceof Map) {
    return new Map([...node.entries()].map(([k, v]) => [k, stripLocations(v)])) as unknown as T;
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "loc") continue;
      out[key] = stripLocations(value);
    }
    return out as T;
  }
  return node;
}
