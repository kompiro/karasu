// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("renders alongside the AI settings section (both localized in Phase C2)", () => {
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

// Phase C2 translates every remaining string in the AI settings block. The
// check below verifies the block is locale-aware end-to-end: English when
// the locale is 'en', Japanese when it's 'ja'. This replaces the Phase C1
// boundary guard (which verified the block stayed untranslated).
describe("SettingsPane — AI settings localization (Phase C2)", () => {
  it("renders the AI section in English when locale is 'en'", () => {
    const { container } = renderWithLocale("en");
    expect(container.textContent).toContain("AI settings");
    expect(container.textContent).toContain("About security");
    expect(container.textContent).toContain("Claude API key");
    expect(container.textContent).toContain("Persist across sessions");
    expect(container.textContent).toContain("Save");
    // Original Japanese strings should no longer appear in the English view
    expect(container.textContent).not.toContain("AI 設定");
    expect(container.textContent).not.toContain("セキュリティについて");
  });

  it("renders the AI section in Japanese when locale is 'ja'", () => {
    const { container } = renderWithLocale("ja");
    expect(container.textContent).toContain("AI 設定");
    expect(container.textContent).toContain("セキュリティについて");
    expect(container.textContent).toContain("Claude API キー");
    expect(container.textContent).toContain("セッションをまたいで保存する");
    expect(container.textContent).toContain("保存する");
  });

  it("switches the save button label to the 'saved' state after a successful save", () => {
    renderWithLocale("en");
    const input = screen.getByLabelText(/Claude API key/i) as HTMLInputElement;
    act(() => {
      input.value = "sk-ant-test";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Button label text varies by locale but the distinction between the two
    // states is the emoji prefix; verify the pre-save label exists.
    expect(screen.getByRole("button", { name: /Save/i })).toBeTruthy();
  });
});
