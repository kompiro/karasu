import { describe, expect, it } from "vitest";
import { format, tidyStyleSheet } from "@karasu-tools/core";
import { formatSource } from "./formatting.js";

// Unit fence for the LSP document-formatting routing decision: `.krs` goes
// to the source formatter, `.krs.style` goes to the Tidy passes (#2001).
// The `onDocumentFormatting` handler only wraps this result in a TextEdit.

describe("formatSource — LSP formatter routing", () => {
  it("routes .krs.style to tidyStyleSheet", () => {
    // Duplicate selectors merge under Tidy. This source is NOT valid .krs
    // (the source formatter would refuse it), so getting the tidied output
    // back proves the style branch was taken.
    const src = `edge#A->B { direction: down; }\nedge#A->B { direction: up; }\n`;

    const result = formatSource(src, true);
    expect(result).not.toBeNull();
    expect(result).toBe(tidyStyleSheet(src).output);
  });

  it("routes .krs to the source formatter", () => {
    // Over-indented source; the canonical formatter normalizes it.
    const src = `system Platform {\n      service Auth {}\n}\n`;

    const result = formatSource(src, false);
    expect(result).not.toBeNull();
    expect(result).toBe(format(src));
  });

  it("returns null on FormatError", () => {
    // Unparseable .krs: `format` throws FormatError, which the router maps
    // to "no edit" instead of surfacing an exception to the LSP client.
    expect(formatSource("!!! not valid krs !!!", false)).toBeNull();
  });

  it("returns null when already formatted", () => {
    const canonicalKrs = format(`system Platform {\n      service Auth {}\n}\n`);
    expect(formatSource(canonicalKrs, false)).toBeNull();

    const canonicalStyle = tidyStyleSheet(`edge#A->B { direction: down; }\n`).output;
    expect(formatSource(canonicalStyle, true)).toBeNull();
  });
});
