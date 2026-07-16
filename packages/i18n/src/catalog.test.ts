import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { ja } from "./ja.js";

// Drift guard for the ja catalog. `ja` is deliberately typed
// `Partial<Translations>` (docs/spec/i18n.md allows landing ja keys
// incrementally, falling back to English), so TypeScript enforces nothing
// about its keys. These assertions catch the failure mode the type system
// cannot: a typo'd ja key silently falls back to English at render time
// AND sits undetected as an orphan entry.
//
// Intentionally NOT asserted: full ja completeness — that would contradict
// the partial-map policy.
describe("catalog drift guard — ja vs en", () => {
  it("every ja key exists in en (no orphan / typo'd ja keys)", () => {
    const enKeys = new Set<string>(Object.keys(en));
    const orphans = Object.keys(ja).filter((key) => !enKeys.has(key));
    expect(orphans).toEqual([]);
  });

  it("ja keys appear in the same relative order as en", () => {
    // Keeping the two catalogs in the same order makes side-by-side
    // review (and key-set diffs) trivial. Only relative order is checked;
    // gaps (untranslated keys) are allowed.
    const enIndex = new Map(Object.keys(en).map((key, i) => [key, i]));
    const jaOrder = Object.keys(ja)
      .map((key) => enIndex.get(key))
      .filter((i): i is number => i !== undefined);
    const sorted = [...jaOrder].sort((a, b) => a - b);
    expect(jaOrder).toEqual(sorted);
  });
});
