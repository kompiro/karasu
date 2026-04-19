// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/index.js";
import { SettingsPane } from "./SettingsPane.js";

function renderWithLocale(initialLocale: "en" | "ja" = "en") {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <SettingsPane onApiKeyChange={() => undefined} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SettingsPane — language selector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the language section heading in English by default", () => {
    renderWithLocale("en");
    expect(screen.getByRole("heading", { name: /Language/i })).toBeTruthy();
  });

  it("renders the language section heading in Japanese when locale is 'ja'", () => {
    renderWithLocale("ja");
    expect(screen.getByRole("heading", { name: /言語/i })).toBeTruthy();
  });

  it("offers English and Japanese options with localized labels", () => {
    renderWithLocale("en");
    const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;

    const options = Array.from(select.options).map((o) => ({
      value: o.value,
      text: o.text,
    }));

    expect(options).toEqual([
      { value: "en", text: "English" },
      { value: "ja", text: "Japanese" },
    ]);
  });

  it("reflects the active locale in the select value", () => {
    renderWithLocale("ja");
    const select = screen.getByLabelText(/言語/i) as HTMLSelectElement;
    expect(select.value).toBe("ja");
  });

  it("calls setLocale and re-renders when the user switches language", () => {
    const { container } = renderWithLocale("en");

    // Heading is English initially
    expect(container.querySelector(".settings-section__title")?.textContent).toContain("Language");

    const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;
    act(() => {
      select.value = "ja";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Heading switches to Japanese and the select now reflects ja
    expect(container.querySelector(".settings-section__title")?.textContent).toContain("言語");
    expect(select.value).toBe("ja");
  });

  it("persists the chosen locale to localStorage so the next mount picks it up", () => {
    renderWithLocale("en");

    const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;
    act(() => {
      select.value = "ja";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(localStorage.getItem("karasu-locale")).toBe("ja");
  });

  it("renders alongside the existing AI settings section", () => {
    // The language section is additive; existing "AI 設定" content must remain.
    renderWithLocale("ja");
    expect(screen.getByRole("heading", { name: /AI 設定/ })).toBeTruthy();
  });
});

describe("SettingsPane — component isolation", () => {
  it("does not throw when locale is switched mid-render", () => {
    const { container } = renderWithLocale("en");
    const select = container.querySelector("#settings-language") as HTMLSelectElement;

    // Rapid toggle — simulates the user flipping back and forth
    for (const value of ["ja", "en", "ja"]) {
      act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    expect(select.value).toBe("ja");
  });

  it("does not interact with the existing API key silent-persistence code path", () => {
    // If anything weird were coupling these two sections, toggling locale
    // would incidentally touch localStorage["karasu-api-key"]. Verify that
    // doesn't happen.
    localStorage.removeItem("karasu-api-key");
    renderWithLocale("en");

    const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;
    act(() => {
      select.value = "ja";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(localStorage.getItem("karasu-api-key")).toBeNull();
  });
});

// Guard against accidentally translating the AI settings block in Phase C1.
// That block moves in Phase C2; this test fails loudly if something sneaks
// through early.
describe("SettingsPane — Phase C2 boundary", () => {
  it("keeps AI settings strings untranslated in Phase C1", () => {
    const silenced = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { container } = renderWithLocale("en");
      expect(container.textContent).toContain("AI 設定");
      expect(container.textContent).toContain("セキュリティについて");
    } finally {
      silenced.mockRestore();
    }
  });
});
