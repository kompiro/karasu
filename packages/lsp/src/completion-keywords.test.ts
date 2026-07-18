import { describe, it, expect } from "vitest";
import { KRS_KEYWORD_NAMES } from "@karasu-tools/core";
import { KRS_KEYWORDS } from "./completion-keywords.js";

// KRS_KEYWORDS (the LSP completion list) is derived directly from the
// lexer's KRS_KEYWORD_NAMES (karasu #2067, closing the drift documented in
// #2017 finding 7). This test asserts exact parity so any future edit that
// re-introduces a hand-maintained divergence fails CI immediately.

describe("KRS_KEYWORDS vs core KRS_KEYWORD_NAMES — zero drift", () => {
  it("has no lexer keywords missing from completion", () => {
    const missing = KRS_KEYWORD_NAMES.filter((kw) => !KRS_KEYWORDS.includes(kw)).sort();
    expect(missing).toEqual([]);
  });

  it("has no completion entries that are not lexer keywords", () => {
    const extra = [...KRS_KEYWORDS].filter((kw) => !KRS_KEYWORD_NAMES.includes(kw)).sort();
    expect(extra).toEqual([]);
  });
});
