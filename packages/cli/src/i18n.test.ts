import { describe, it, expect } from "vitest";
import { resolveCliLocale } from "./i18n.js";

describe("resolveCliLocale", () => {
  it("resolves a Japanese LANG to 'ja'", () => {
    expect(resolveCliLocale({ LANG: "ja_JP.UTF-8" })).toBe("ja");
    expect(resolveCliLocale({ LANG: "ja" })).toBe("ja");
  });

  it("resolves any non-Japanese LANG to 'en'", () => {
    expect(resolveCliLocale({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(resolveCliLocale({ LANG: "de_DE.UTF-8" })).toBe("en");
    expect(resolveCliLocale({ LANG: "C" })).toBe("en");
  });

  it("lets LC_ALL override LANG", () => {
    expect(resolveCliLocale({ LC_ALL: "ja_JP.UTF-8", LANG: "en_US.UTF-8" })).toBe("ja");
    expect(resolveCliLocale({ LC_ALL: "en_US.UTF-8", LANG: "ja_JP.UTF-8" })).toBe("en");
  });

  it("defaults to 'en' when no locale env vars are set", () => {
    expect(resolveCliLocale({})).toBe("en");
  });
});
