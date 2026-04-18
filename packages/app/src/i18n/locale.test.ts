// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLocale, setLocale } from "./locale";

describe("locale", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("resolveLocale", () => {
    it("returns the value stored in localStorage when present and valid", () => {
      localStorage.setItem("karasu-locale", "ja");
      expect(resolveLocale()).toBe("ja");

      localStorage.setItem("karasu-locale", "en");
      expect(resolveLocale()).toBe("en");
    });

    it("ignores invalid stored values and falls through to browser detection", () => {
      localStorage.setItem("karasu-locale", "fr");
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
      expect(resolveLocale()).toBe("en");
    });

    it("detects ja when navigator.language starts with ja", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
      expect(resolveLocale()).toBe("ja");
    });

    it("defaults to en for any other navigator.language", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
      expect(resolveLocale()).toBe("en");

      vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
      expect(resolveLocale()).toBe("en");
    });

    it("defaults to en when navigator.language is empty", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("");
      expect(resolveLocale()).toBe("en");
    });
  });

  describe("setLocale", () => {
    it("writes the locale to localStorage", () => {
      setLocale("ja");
      expect(localStorage.getItem("karasu-locale")).toBe("ja");

      setLocale("en");
      expect(localStorage.getItem("karasu-locale")).toBe("en");
    });

    it("is observed by a subsequent resolveLocale call", () => {
      setLocale("ja");
      expect(resolveLocale()).toBe("ja");
    });
  });
});
