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

  it("lets LC_MESSAGES override LANG", () => {
    // The standard split: English formatting, Japanese program messages.
    expect(resolveCliLocale({ LC_MESSAGES: "ja_JP.UTF-8", LANG: "en_US.UTF-8" })).toBe("ja");
    expect(resolveCliLocale({ LC_MESSAGES: "en_US.UTF-8", LANG: "ja_JP.UTF-8" })).toBe("en");
  });

  it("lets LC_ALL override LC_MESSAGES", () => {
    expect(
      resolveCliLocale({ LC_ALL: "ja_JP.UTF-8", LC_MESSAGES: "en_US.UTF-8", LANG: "en_US.UTF-8" }),
    ).toBe("ja");
    expect(
      resolveCliLocale({ LC_ALL: "en_US.UTF-8", LC_MESSAGES: "ja_JP.UTF-8", LANG: "ja_JP.UTF-8" }),
    ).toBe("en");
  });

  it("treats an empty variable as unset at every link of the chain", () => {
    // `||` rather than `??`: `LC_ALL=` is how a shell unsets an inherited
    // override, so an empty value must fall through rather than win.
    expect(resolveCliLocale({ LC_ALL: "", LC_MESSAGES: "ja_JP.UTF-8" })).toBe("ja");
    expect(resolveCliLocale({ LC_MESSAGES: "", LANG: "ja_JP.UTF-8" })).toBe("ja");
    expect(resolveCliLocale({ LC_ALL: "", LC_MESSAGES: "", LANG: "ja_JP.UTF-8" })).toBe("ja");
  });

  it("resolves LC_MESSAGES when it is the only variable set", () => {
    expect(resolveCliLocale({ LC_MESSAGES: "ja_JP.UTF-8" })).toBe("ja");
  });

  it("defaults to 'en' when no locale env vars are set", () => {
    expect(resolveCliLocale({})).toBe("en");
  });
});
