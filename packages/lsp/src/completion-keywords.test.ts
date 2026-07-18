import { describe, it, expect } from "vitest";
import { KRS_KEYWORD_NAMES } from "@karasu-tools/core";
import { KRS_KEYWORDS } from "./completion-keywords.js";

// KRS_KEYWORDS (the LSP completion list) is a CURATED subset of the grammar's
// keywords, not a blind copy of the lexer table — LSP completion is
// context-free, so block-scoped keywords are deliberately excluded (karasu
// #2067). These tests are the real lexer→completion drift guard:
//
//   1. Every completion entry must be a recognized keyword — catches typos and
//      invented completions.
//   2. The lexer keywords NOT offered by completion must be exactly the
//      explicitly-triaged EXCLUDED_FROM_COMPLETION set — so when a NEW keyword
//      is added to the lexer, this test FAILS until a human decides whether to
//      include it in completion or add it to the excluded set with a reason.

// Deploy-block contextual keywords the parser matches by value (DEPLOY_KEYWORDS
// in packages/core/src/parser/parser.ts) that are NOT in the lexer's KEYWORDS
// table. Only `store` falls in this gap — the rest (war/jar/oci/…) are lexer
// keywords. These are legitimate completion entries even though they are absent
// from KRS_KEYWORD_NAMES.
const DEPLOY_CONTEXTUAL_KEYWORDS = ["store"];

// The universe of recognized keywords a completion entry may legitimately be.
const RECOGNIZED_KEYWORDS = new Set([...KRS_KEYWORD_NAMES, ...DEPLOY_CONTEXTUAL_KEYWORDS]);

// Lexer keywords deliberately NOT offered as global (context-free) completions.
// Each is only grammatically valid deep inside one specific construct, so
// surfacing it everywhere would mislead. When the lexer gains a new keyword it
// will fail the parity test below until it is triaged into either KRS_KEYWORDS
// or this set.
const EXCLUDED_FROM_COMPLETION = [
  "handles", // node property block (usecase/capability body)
  "operations", // node property block
  "delivers", // node property block
  "contains", // boundary body only
  "from", // import tail (`import X from "…"`) — never a standalone starter
  "table", // database body only
  "bucket", // storage body only
  "swatch", // legend body only
  "ref", // legend/swatch body only
].sort();

describe("KRS_KEYWORDS completion curation — lexer drift guard", () => {
  it("offers only recognized keywords (no typos / invented entries)", () => {
    const unrecognized = KRS_KEYWORDS.filter((kw) => !RECOGNIZED_KEYWORDS.has(kw)).sort();
    expect(unrecognized).toEqual([]);
  });

  it("keeps the deploy contextual keyword `store` in completion", () => {
    expect(KRS_KEYWORDS).toContain("store");
  });

  it("excludes exactly the explicitly-triaged block-scoped keywords", () => {
    const excluded = KRS_KEYWORD_NAMES.filter((kw) => !KRS_KEYWORDS.includes(kw)).sort();
    expect(excluded).toEqual(EXCLUDED_FROM_COMPLETION);
  });
});
