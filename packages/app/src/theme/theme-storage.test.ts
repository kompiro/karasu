// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyEffectiveTheme,
  isThemePreference,
  resolveEffectiveTheme,
  resolveThemePreference,
  setStoredTheme,
} from "./theme-storage.js";

/** Stub `matchMedia` with a query whose `matches` is `prefersLight`. */
function stubMatchMedia(prefersLight: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: prefersLight,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
});

describe("isThemePreference", () => {
  it("accepts the three valid preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe("resolveThemePreference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 'system' when nothing is stored", () => {
    expect(resolveThemePreference()).toBe("system");
  });

  it("returns a stored valid preference", () => {
    localStorage.setItem("karasu-theme", "light");
    expect(resolveThemePreference()).toBe("light");
  });

  it("falls back to 'system' when the stored value is invalid", () => {
    localStorage.setItem("karasu-theme", "neon");
    expect(resolveThemePreference()).toBe("system");
  });
});

describe("resolveEffectiveTheme", () => {
  it("returns an explicit preference unchanged", () => {
    stubMatchMedia(true); // OS = light — must be ignored for explicit prefs
    expect(resolveEffectiveTheme("light")).toBe("light");
    expect(resolveEffectiveTheme("dark")).toBe("dark");
  });

  it("derives 'system' from prefers-color-scheme: light", () => {
    stubMatchMedia(true);
    expect(resolveEffectiveTheme("system")).toBe("light");
  });

  it("derives 'system' from prefers-color-scheme: dark", () => {
    stubMatchMedia(false);
    expect(resolveEffectiveTheme("system")).toBe("dark");
  });

  it("defaults 'system' to dark when matchMedia is unavailable", () => {
    // jsdom has no matchMedia unless stubbed.
    expect(resolveEffectiveTheme("system")).toBe("dark");
  });
});

describe("setStoredTheme", () => {
  it("persists the preference so the next resolve picks it up", () => {
    setStoredTheme("light");
    expect(localStorage.getItem("karasu-theme")).toBe("light");
    expect(resolveThemePreference()).toBe("light");
  });
});

describe("applyEffectiveTheme", () => {
  it("writes the effective theme onto <html data-theme>", () => {
    applyEffectiveTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyEffectiveTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
