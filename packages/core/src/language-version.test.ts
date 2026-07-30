import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KRS_LANGUAGE_VERSION } from "./language-version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Drift guard between the code constant and the spec docs (ADR-2124,
// TPL-20260511-02): both spec references state the language version as the
// canonical token `.krs language v<version>` (roadmap §version vocabulary).
// If the language version ever moves, the constant and all four docs must
// move in the same PR — this test fails on any partial update.
const SPEC_DOCS = [
  "../../../docs/spec/syntax.md",
  "../../../docs/spec/syntax.ja.md",
  "../../../docs/spec/style.md",
  "../../../docs/spec/style.ja.md",
];

describe("KRS_LANGUAGE_VERSION", () => {
  it("is a major.minor version", () => {
    expect(KRS_LANGUAGE_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it.each(SPEC_DOCS)("%s states the canonical language-version token", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    expect(doc).toContain(`.krs language v${KRS_LANGUAGE_VERSION}`);
  });

  // Forward references to a HIGHER version are legitimate — the spec's
  // promotion-path phrasing ("becomes an error in `.krs language v2.0`",
  // ADR-2124 canonical token) — so stale means strictly lower than current.
  it.each(SPEC_DOCS)("%s does not state a stale language version", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    const [major, minor] = KRS_LANGUAGE_VERSION.split(".").map(Number);
    const stale = [...doc.matchAll(/\.krs language v(\d+)\.(\d+)/g)]
      .filter(([, docMajor, docMinor]) => {
        const [ma, mi] = [Number(docMajor), Number(docMinor)];
        return ma < major || (ma === major && mi < minor);
      })
      .map(([token]) => token);
    expect(stale).toEqual([]);
  });
});
