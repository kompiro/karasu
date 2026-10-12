import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// #3032: a negative value written in a style sheet lost its sign in the lexer,
// so `label-offset: -20px` moved the label down like `20px`. The resolver tests
// hand the value string straight to `resolveStyles`, past the lexer and the
// parser, and could not see it. These tests start from sheet text.

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

/** `[x, y]` of the edge label's `<text>`. */
function labelAt(styleSource?: string): [number, number] {
  const { svg } = compile(MODEL, styleSource === undefined ? {} : { styleSource });
  const match = /<text\b[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"[^>]*>calls<\/text>/.exec(svg);
  if (!match) throw new Error("edge label <text> not found");
  return [Number(match[1]), Number(match[2])];
}

describe("signed lengths in a style sheet (#3032)", () => {
  const [x, y] = labelAt();

  it("moves the label down for a positive label-offset", () => {
    expect(labelAt("edge { label-offset: 20px; }")).toEqual([x, y + 20]);
  });

  it("moves the label up for a negative label-offset", () => {
    expect(labelAt("edge { label-offset: -20px; }")).toEqual([x, y - 20]);
  });

  it("moves the label up and left for a negative two-length label-offset", () => {
    expect(labelAt("edge { label-offset: 0 -20px; }")).toEqual([x, y - 20]);
    expect(labelAt("edge { label-offset: -10px -20px; }")).toEqual([x - 10, y - 20]);
  });

  it("draws a negative stroke-width at the default width", () => {
    const strokeWidths = (style?: string) =>
      [
        ...compile(MODEL, style === undefined ? {} : { styleSource: style }).svg.matchAll(
          /stroke-width="([^"]+)"/g,
        ),
      ].map((m) => m[1]);
    expect(strokeWidths("edge { stroke-width: -3px; }")).toEqual(strokeWidths());
  });

  it("draws a negative opacity at the default opacity", () => {
    const opacities = (style?: string) =>
      [
        ...compile(MODEL, style === undefined ? {} : { styleSource: style }).svg.matchAll(
          /opacity="([^"]+)"/g,
        ),
      ].map((m) => m[1]);
    expect(opacities("service { opacity: -0.5; }")).toEqual(opacities());
  });
});
