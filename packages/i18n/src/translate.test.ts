import { describe, expect, it, vi } from "vitest";

// Mock ja.ts with a deliberately partial map so we can exercise the
// English-fallback path. `translate` reads `ja` through this module.
vi.mock("./ja.js", () => ({
  ja: {
    // Intentionally only provide one of the three keys; the others should
    // fall through to en.
    "languageSelector.label": "言語",
  },
}));

const { translate } = await import("./translate.js");

describe("translate", () => {
  it("returns the English value when locale is 'en'", () => {
    expect(translate("en", "languageSelector.label")).toBe("Language");
    expect(translate("en", "languageSelector.english")).toBe("English");
  });

  it("returns the Japanese value for keys present in the ja map", () => {
    expect(translate("ja", "languageSelector.label")).toBe("言語");
  });

  it("falls back to English when a key is missing in the active locale map", () => {
    // ja.ts is mocked (top of file) to include only "languageSelector.label".
    expect(translate("ja", "languageSelector.english")).toBe("English");
    expect(translate("ja", "languageSelector.japanese")).toBe("Japanese");
  });

  it("invokes parameterized (function-valued) entries with the params", () => {
    expect(translate("en", "warning.unassignedDomain.message", { display: "Orders" })).toContain(
      "Orders",
    );
  });
});
