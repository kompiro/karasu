import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// #3141: a declaration whose value fails its property's schema is reported
// once and drawn as if it were not written (TPL-3141). These tests start from
// sheet text and read the SVG, so they cover the parser, the validator, the
// cascade and the resolver together.

const MODEL = `
system S {
  service A {
    label "A"
  }
  service B {
    label "B"
  }
  A -> B "calls"
}
`;

interface Rendered {
  svg: string;
  /** Style findings: the validator's warnings and the parser's errors. */
  findings: string[];
  /** `[x, y]` of the edge label's `<text>`. */
  label: [number, number];
}

function render(styleSource?: string): Rendered {
  const result = compile(MODEL, styleSource === undefined ? {} : { styleSource });
  const findings = [
    ...result.warnings.filter((w) => w.kind.startsWith("style-")).map((w) => w.kind),
    ...result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  ];
  const match = /<text\b[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"[^>]*>calls<\/text>/.exec(
    result.svg,
  );
  if (!match) throw new Error("edge label <text> not found");
  return { svg: result.svg, findings, label: [Number(match[1]), Number(match[2])] };
}

/** The `<rect>` of node `id`. */
function nodeRect(svg: string, id: string): string {
  const group = svg.slice(svg.indexOf(`data-node-id="${id}"`));
  const rect = /<rect\b[^>]*>/.exec(group);
  if (!rect) throw new Error(`no rect for ${id}`);
  return rect[0];
}

describe("style values the schema rejects are reported and not drawn (#3141)", () => {
  const plain = render();

  it("reports a unitless non-zero length and draws the default width", () => {
    const { svg, findings } = render("edge { stroke-width: 4; }");
    expect(findings).toEqual(["style-missing-length-unit"]);
    expect(svg).toBe(plain.svg);
  });

  it("accepts a unitless 0, so `border-width: 0` removes the border without a finding", () => {
    const { svg, findings } = render("#A { border-width: 0; }");
    expect(findings).toEqual([]);
    expect(nodeRect(svg, "A")).toContain('stroke-width="0"');
  });

  it("reports several parts where one number is expected, and draws the default", () => {
    const { svg, findings } = render("#A { opacity: -0.5 0.2; }");
    expect(findings).toEqual(["style-invalid-enum-value"]);
    expect(svg).toBe(plain.svg);
  });

  it("applies a two-length label-offset without a finding", () => {
    const { label, findings } = render("edge { label-offset: 0 8px; }");
    expect(findings).toEqual([]);
    expect(label).toEqual([plain.label[0], plain.label[1] + 8]);
  });

  it("applies an unquoted multi-word font name without a finding", () => {
    const { svg, findings } = render("#A { font-family: Noto Sans, serif; }");
    expect(findings).toEqual([]);
    expect(svg).toContain('font-family="Noto Sans , serif"');
  });

  it("rejects a third label-offset length as a whole, so a weaker rule's value applies", () => {
    const weak = render("edge { label-offset: 0 8px; }");
    // Precondition: the stronger selector reaches this edge.
    const strong = render("edge { label-offset: 0 8px; }\nedge#A->B { label-offset: 4px 8px; }");
    expect(strong.label).not.toEqual(weak.label);
    const { label, findings } = render(
      "edge { label-offset: 0 8px; }\nedge#A->B { label-offset: 4px 8px 12px; }",
    );
    expect(findings).toEqual(["style-invalid-enum-value"]);
    expect(label).toEqual(weak.label);
  });

  it("keeps the builtin theme, which writes its lengths without a unit", () => {
    // The default node border is the builtin's `border-width: 2;`.
    expect(nodeRect(plain.svg, "A")).toContain('stroke-width="2"');
    expect(plain.findings).toEqual([]);
  });
});
