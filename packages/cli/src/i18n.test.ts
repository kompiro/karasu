import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLI_LOCALE_ENV_CHAIN, resolveCliLocale } from "./i18n.js";

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
    // Truthiness rather than `??`: `LC_ALL=` is how a shell unsets an inherited
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

// Walks CLI_LOCALE_ENV_CHAIN, the tuple the resolver reads, so a link added to
// the chain is tested at once: it wins over every later link, loses to every
// earlier one, and an empty value there falls through (TPL-2536).
describe("every link of CLI_LOCALE_ENV_CHAIN", () => {
  const links = CLI_LOCALE_ENV_CHAIN.map((name, i) => ({ name, later: CLI_LOCALE_ENV_CHAIN.slice(i + 1) }));

  it.each(links)("$name alone sets the locale", ({ name }) => {
    expect(resolveCliLocale({ [name]: "ja_JP.UTF-8" })).toBe("ja");
  });

  it.each(links)("$name wins over every later link", ({ name, later }) => {
    const env = Object.fromEntries(later.map((v) => [v, "ja_JP.UTF-8"]));
    expect(resolveCliLocale({ ...env, [name]: "en_US.UTF-8" })).toBe("en");
  });

  it.each(links)("an empty $name falls through to each later link", ({ name, later }) => {
    for (const next of later) {
      expect(resolveCliLocale({ [name]: "", [next]: "ja_JP.UTF-8" })).toBe("ja");
    }
    expect(resolveCliLocale({ [name]: "" })).toBe("en");
  });

  it("docs/spec/i18n.md states the same chain", () => {
    const spec = readFileSync(resolve(import.meta.dirname, "../../../docs/spec/i18n.md"), "utf8");
    expect(spec).toContain(CLI_LOCALE_ENV_CHAIN.map((v) => `\`${v}\``).join(" > "));
  });
});
