import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { ja } from "./ja.js";

// Key-ORDER drift guard for the ja catalog. Key MEMBERSHIP needs no test:
// `ja` is a fresh object literal typed `Partial<Translations>`, so
// TypeScript's excess property checking already rejects any key that does
// not exist in `en` at compile time. Ordering, however, is not
// type-enforced — keeping the two catalogs in the same relative order is
// what makes side-by-side review (and key-set diffs) trivial, so it gets
// a runtime fence here.
//
// Intentionally NOT asserted: full ja completeness — `ja` is deliberately
// partial (docs/spec/i18n.md allows landing ja keys incrementally, falling
// back to English), so gaps are allowed.
describe("catalog drift guard — ja vs en", () => {
  it("ja keys appear in the same relative order as en", () => {
    const enIndex = new Map(Object.keys(en).map((key, i) => [key, i]));
    const jaOrder = Object.keys(ja)
      .map((key) => enIndex.get(key))
      .filter((i): i is number => i !== undefined);
    const sorted = [...jaOrder].sort((a, b) => a - b);
    expect(jaOrder).toEqual(sorted);
  });
});
