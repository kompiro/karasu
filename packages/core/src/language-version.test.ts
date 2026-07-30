import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KRS_LANGUAGE_VERSION } from "./language-version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Drift guard between the code constant and the spec docs (ADR-2124,
// TPL-1296): both spec references state the language version as the
// canonical token `.krs language v<version>` (roadmap §version vocabulary).
// If the language version ever moves, the constant and all four docs must
// move in the same PR — this test fails on any partial update.
const SPEC_DOCS = [
  "../../../docs/spec/syntax.md",
  "../../../docs/spec/syntax.ja.md",
  "../../../docs/spec/style.md",
  "../../../docs/spec/style.ja.md",
];

const VERSION_TOKEN = /\.krs language v(\d+\.\d+)/g;

/** `a` orders before `b` as a major.minor language version. */
function isBefore(a: string, b: string): boolean {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor !== bMajor ? aMajor < bMajor : aMinor < bMinor;
}

/**
 * Version tokens in `doc` that the language has already moved past.
 *
 * Only *lagging* mentions are drift. Spec prose legitimately points **forward**
 * at a version the language has not reached: v1.0 is frozen (ADR-1314) while
 * v2.0 grammar is designed and experimental notation lands under the freeze, so
 * syntax.md registers a diagnostic's promotion to an error against
 * `.krs language v2.0`. Rejecting every token that differs from the current
 * version would make the guard block the v2.0 work it is meant to accompany —
 * which is exactly how it broke on main (#2183's forward reference + #2185's
 * guard, each green alone).
 */
function staleVersions(doc: string, current: string): string[] {
  return [...doc.matchAll(VERSION_TOKEN)]
    .map((m) => m[1])
    .filter((version) => isBefore(version, current));
}

describe("KRS_LANGUAGE_VERSION", () => {
  it("is a major.minor version", () => {
    expect(KRS_LANGUAGE_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it.each(SPEC_DOCS)("%s states the canonical language-version token", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    expect(doc).toContain(`.krs language v${KRS_LANGUAGE_VERSION}`);
  });

  it.each(SPEC_DOCS)("%s does not state a stale language version", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    expect(staleVersions(doc, KRS_LANGUAGE_VERSION)).toEqual([]);
  });

  describe("stale detection", () => {
    it("flags a version the language has moved past", () => {
      expect(staleVersions("frozen at `.krs language v1.0`", "1.1")).toEqual(["1.0"]);
      expect(staleVersions("frozen at `.krs language v1.9`", "2.0")).toEqual(["1.9"]);
    });

    it("allows a forward reference to a version not yet reached", () => {
      // The shape that broke main: v1.0 is current, v2.0 is being designed.
      const doc =
        "`.krs language v1.0` is frozen; promotion is registered to `.krs language v2.0`.";
      expect(staleVersions(doc, "1.0")).toEqual([]);
      expect(staleVersions("registered to `.krs language v1.1`", "1.0")).toEqual([]);
    });

    it("allows the current version", () => {
      expect(staleVersions("`.krs language v1.0`", "1.0")).toEqual([]);
    });

    it("compares minor versions numerically, not lexically", () => {
      // "10" < "9" as strings; 1.10 is after 1.9 as a version.
      expect(staleVersions("`.krs language v1.10`", "1.9")).toEqual([]);
      expect(staleVersions("`.krs language v1.9`", "1.10")).toEqual(["1.9"]);
    });
  });
});
