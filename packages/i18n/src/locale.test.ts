import { describe, expect, it } from "vitest";
import { isLocale, resolveLocaleTag } from "./locale.js";

// `resolveLocaleTag` is the single owner of the raw-tag → `Locale` rule that
// the app / lsp / cli / vscode consumers all delegate to (#2081). Their own
// tests cover where each one reads its raw tag from; the matching rule itself
// is fenced here, once.
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
  });

  it("returns a value the `isLocale` guard accepts", () => {
    expect(isLocale(resolveLocaleTag("ja-JP"))).toBe(true);
    expect(isLocale(resolveLocaleTag("qq-ZZ"))).toBe(true);
  });
});
