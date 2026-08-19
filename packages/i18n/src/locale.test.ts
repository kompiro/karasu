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

  // The two cases below are what separate the current prefix match from an
  // exact primary-subtag match; without them every other assertion in this
  // file passes under either rule, and "tightening" the matcher would look
  // green while flipping Japanese Windows users to English. Issue #2535
  // decides which rule is right — until it lands, these pin what ships.
  describe("prefix-match boundary (inherited, see #2535)", () => {
    it("claims non-Japanese ja* subtags", () => {
      expect(resolveLocaleTag("jav-ID")).toBe("ja"); // Javanese
      expect(resolveLocaleTag("jam-JM")).toBe("ja"); // Jamaican Creole
    });

    it("catches the Windows POSIX form an exact-subtag match would miss", () => {
      expect(resolveLocaleTag("Japanese_Japan.932")).toBe("ja");
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
