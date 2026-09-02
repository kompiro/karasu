import { describe, expect, it } from "vitest";
import { isLocale, resolveLocaleTag } from "./locale.js";

// `resolveLocaleTag` is the single owner of the raw-tag → `Locale` rule that
// the app / lsp / cli / vscode consumers all delegate to (#2081). Their own
// tests cover where each one reads its raw tag from; the matching rule itself
// is fenced here, once. `scripts/lint/locale-normalization-single-owner.ts`
// fails the build if a consumer re-inlines the rule instead.
describe("resolveLocaleTag", () => {
  it("resolves Japanese BCP-47 tags to 'ja'", () => {
    expect(resolveLocaleTag("ja")).toBe("ja");
    expect(resolveLocaleTag("ja-JP")).toBe("ja");
    expect(resolveLocaleTag("ja-jp")).toBe("ja");
  });

  it("resolves Japanese POSIX locale strings to 'ja'", () => {
    expect(resolveLocaleTag("ja_JP.UTF-8")).toBe("ja");
    expect(resolveLocaleTag("ja_JP")).toBe("ja");
  });

  it("matches the language subtag case-insensitively", () => {
    expect(resolveLocaleTag("JA")).toBe("ja");
    expect(resolveLocaleTag("Ja-Jp")).toBe("ja");
  });

  it("falls back to 'en' for any non-Japanese tag", () => {
    expect(resolveLocaleTag("en")).toBe("en");
    expect(resolveLocaleTag("en-US")).toBe("en");
    expect(resolveLocaleTag("en_US.UTF-8")).toBe("en");
    expect(resolveLocaleTag("de-DE")).toBe("en");
    expect(resolveLocaleTag("fr")).toBe("en");
    expect(resolveLocaleTag("C")).toBe("en");
  });

  it("falls back to 'en' when the environment reports no tag", () => {
    expect(resolveLocaleTag("")).toBe("en");
    expect(resolveLocaleTag(undefined)).toBe("en");
    // `localStorage.getItem` / `Headers.get` return null when unset.
    expect(resolveLocaleTag(null)).toBe("en");
  });

  // The cases below are what separate the exact primary-subtag match from the
  // prefix match it replaced (ADR-2535). Every other assertion in this file
  // passes under either rule, so without these the boundary is unpinned in
  // both directions: loosening the matcher back to a prefix would look green,
  // and so would tightening it in a way that drops Japanese Windows users.
  describe("primary-subtag boundary (ADR-2535)", () => {
    it("leaves non-Japanese ja* languages to the English fallback", () => {
      expect(resolveLocaleTag("jav")).toBe("en"); // Javanese
      expect(resolveLocaleTag("jav-ID")).toBe("en");
      expect(resolveLocaleTag("jam")).toBe("en"); // Jamaican Creole
      expect(resolveLocaleTag("jam-JM")).toBe("en");
    });

    it("keeps the Windows language-name form on Japanese", () => {
      expect(resolveLocaleTag("Japanese_Japan.932")).toBe("ja");
      expect(resolveLocaleTag("Japanese")).toBe("ja");
    });

    it("does not extend the Windows allowance to other language names", () => {
      expect(resolveLocaleTag("English_United States.1252")).toBe("en");
    });

    it("matches Japanese however many subtags follow it", () => {
      expect(resolveLocaleTag("ja-Latn-JP")).toBe("ja");
      expect(resolveLocaleTag("ja-JP-u-ca-japanese")).toBe("ja");
    });
  });
});

describe("isLocale", () => {
  it("accepts the two supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(true);
  });

  it("rejects unsupported languages and non-canonical casing", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("ja-JP")).toBe(false);
    expect(isLocale("JA")).toBe(false);
  });

  it("rejects non-string values", () => {
    // The app's `readStoredLocale` feeds this a raw `localStorage.getItem`
    // result, so null and undefined reach it in practice.
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(0)).toBe(false);
    expect(isLocale({})).toBe(false);
  });
});
