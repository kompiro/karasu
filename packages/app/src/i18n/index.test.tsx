// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider, useTranslation } from "./index.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useTranslation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("throws when used outside a LocaleProvider", () => {
    // Suppress the expected React error log from polluting test output
    const silenced = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useTranslation())).toThrow(
        /useTranslation must be used inside <LocaleProvider>/,
      );
    } finally {
      silenced.mockRestore();
    }
  });

  it("returns English translations when locale is 'en'", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>,
    });

    expect(result.current.locale).toBe("en");
    expect(result.current.t("languageSelector.label")).toBe("Language");
    expect(result.current.t("languageSelector.english")).toBe("English");
    expect(result.current.t("languageSelector.japanese")).toBe("Japanese");
  });

  it("returns Japanese translations for keys present in the ja map", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <LocaleProvider initialLocale="ja">{children}</LocaleProvider>,
    });

    expect(result.current.locale).toBe("ja");
    expect(result.current.t("languageSelector.label")).toBe("言語");
  });

  it("re-renders consumers when setLocale is called", () => {
    function Caption() {
      const { t, locale, setLocale } = useTranslation();
      return (
        <div>
          <span data-testid="label">{t("languageSelector.label")}</span>
          <span data-testid="locale">{locale}</span>
          <button onClick={() => setLocale("ja")}>switch</button>
        </div>
      );
    }

    render(
      <LocaleProvider initialLocale="en">
        <Caption />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("label").textContent).toBe("Language");
    expect(screen.getByTestId("locale").textContent).toBe("en");

    act(() => {
      screen.getByText("switch").click();
    });

    expect(screen.getByTestId("label").textContent).toBe("言語");
    expect(screen.getByTestId("locale").textContent).toBe("ja");
  });

  it("persists setLocale to localStorage so the next provider mount picks it up", () => {
    function Switcher() {
      const { setLocale } = useTranslation();
      return <button onClick={() => setLocale("ja")}>switch</button>;
    }

    const { unmount } = render(
      <LocaleProvider initialLocale="en">
        <Switcher />
      </LocaleProvider>,
    );

    act(() => {
      screen.getByText("switch").click();
    });
    unmount();

    expect(localStorage.getItem("karasu-locale")).toBe("ja");

    // Remount without initialLocale — should resolve from localStorage to 'ja'
    function Label() {
      const { locale } = useTranslation();
      return <span data-testid="locale">{locale}</span>;
    }
    render(
      <LocaleProvider>
        <Label />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("ja");
  });
});
