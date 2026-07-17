import { describe, it, expect } from "vitest";
import { KRS_KEYWORD_NAMES } from "@karasu-tools/core";
import { KRS_KEYWORDS } from "./completion-keywords.js";

// KRS_KEYWORDS (the LSP completion list) is a hand-maintained copy of the
// lexer's keyword table and has already drifted from it (karasu #2017,
// finding 7). Swapping the completion list to consume KRS_KEYWORD_NAMES
// directly would change the completion item set — a behavior change out of
// scope for this zero-behavior-change refactor. Instead this test pins the
// KNOWN drift so it's visible and any *new* drift (an edit to one list that
// isn't mirrored in the other) fails CI immediately. Closing the gap is a
// deliberate follow-up PR (issue #2017 finding 7).

describe("KRS_KEYWORDS vs core KRS_KEYWORD_NAMES — drift guard", () => {
  // Keywords the lexer recognizes but the LSP completion list is missing.
  const KNOWN_MISSING = [
    "entity",
    "capability",
    "handles",
    "operations",
    "delivers",
    "boundary",
    "contains",
    "import",
    "from",
    "database",
    "queue",
    "storage",
    "table",
    "bucket",
    "legend",
    "swatch",
    "ref",
  ].sort();

  // Entries in the LSP completion list that are NOT lexer keywords.
  const KNOWN_EXTRA = ["store"].sort();

  it("has exactly the documented set of missing keywords", () => {
    const missing = KRS_KEYWORD_NAMES.filter((kw) => !KRS_KEYWORDS.includes(kw)).sort();
    expect(missing).toEqual(KNOWN_MISSING);
  });

  it("has exactly the documented set of extra (non-lexer) entries", () => {
    const extra = [...KRS_KEYWORDS].filter((kw) => !KRS_KEYWORD_NAMES.includes(kw)).sort();
    expect(extra).toEqual(KNOWN_EXTRA);
  });
});
