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

  // A *stale* mention is one naming a version the language has already moved
  // past — that is the partial-update the guard exists to catch. A mention of a
  // version above the current one is a forward reference to future work
  // ("promotion to an error is registered to `.krs language v2.0`"), which the
  // spec legitimately makes and which must not fail the guard.
  it.each(SPEC_DOCS)("%s does not state a stale language version", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    const stale: string[] = [];
    for (const m of doc.matchAll(/\.krs language v(\d+\.\d+)/g)) {
      if (compareVersions(m[1], KRS_LANGUAGE_VERSION) < 0) stale.push(m[1]);
    }
    expect(stale).toEqual([]);
  });

  // The staleness rule is only as good as its ordering: a string compare would
  // rank "1.10" below "1.9" and silently stop flagging real drift.
  it("orders language versions numerically, not lexically", () => {
    expect(compareVersions("0.9", "1.0")).toBeLessThan(0);
    expect(compareVersions("1.0", "1.0")).toBe(0);
    expect(compareVersions("2.0", "1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
  });
});

/** Numeric `major.minor` comparison: negative when `a` precedes `b`. */
function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor !== bMajor ? aMajor - bMajor : aMinor - bMinor;
}
