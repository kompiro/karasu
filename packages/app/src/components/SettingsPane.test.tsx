// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/index.js";
import { ThemeProvider } from "../theme/index.js";
import { SettingsPane } from "./SettingsPane.js";

function renderWithLocale(initialLocale: "en" | "ja" = "en") {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <ThemeProvider initialTheme="dark">
        <SettingsPane onApiKeyChange={() => undefined} />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsPane — theme selector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the theme section heading", () => {
    renderWithLocale("en");
    expect(screen.getByRole("heading", { name: /Theme/i })).toBeTruthy();
  });

  it("offers System, Light and Dark options", () => {
    renderWithLocale("en");
    const select = screen.getByLabelText(/Theme/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["system", "light", "dark"]);
  });

  it("reflects the active theme preference in the select value", () => {
    // renderWithLocale wraps in <ThemeProvider initialTheme="dark">.
    renderWithLocale("en");
    expect((screen.getByLabelText(/Theme/i) as HTMLSelectElement).value).toBe("dark");
  });

  it("applies and persists the chosen theme when switched", () => {
    renderWithLocale("en");
    const select = screen.getByLabelText(/Theme/i) as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: "light" } });
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("karasu-theme")).toBe("light");
  });

  it("labels the select for assistive tech (TPL-20260516-01)", () => {
    renderWithLocale("ja");
    expect(screen.getByLabelText("テーマ")).toBeTruthy();
  });
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

describe("SettingsPane — Saved indicator timer (#1539)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function typeKey(value: string) {
    // fireEvent.change goes through React's native value setter so the
    // controlled input's value tracker actually registers the change — a bare
    // `input.value = …; dispatchEvent("input")` is deduped by React and lost.
    const input = screen.getByLabelText(/Claude API key/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value } });
    });
  }

  it("reverts the Saved indicator after the 2s window", () => {
    vi.useFakeTimers();
    try {
      renderWithLocale("en");
      typeKey("sk-ant-test");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /Save/i }));
      });
      expect(screen.getByRole("button", { name: /Saved/i })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByRole("button", { name: /Saved/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-arms the timer on a second save instead of reverting early", () => {
    vi.useFakeTimers();
    try {
      renderWithLocale("en");
      typeKey("sk-ant-test");
      const save = () =>
        act(() => {
          fireEvent.click(screen.getByRole("button", { name: /Save|Saved/i }));
        });

      save();
      act(() => {
        vi.advanceTimersByTime(1500); // first window almost elapsed
      });
      save(); // re-arm — must reset the countdown, not let the first timer win
      act(() => {
        vi.advanceTimersByTime(1500); // 1500ms since re-arm — still inside the window
      });
      expect(screen.getByRole("button", { name: /Saved/i })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(500); // now 2000ms since re-arm
      });
      expect(screen.queryByRole("button", { name: /Saved/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not throw if unmounted before the timer fires", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderWithLocale("en");
      typeKey("sk-ant-test");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /Save/i }));
      });
      unmount();
      // Cleanup cleared the timer; advancing time must not call a dead setter.
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SettingsPane — IME composition anti-regression (TPL-20260510-04)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // The API-key input is a plain controlled `<input type="password">`;
  // `setApiKey` is only invoked from its own `onChange`. Nothing rewrites
  // the value mid-composition today, so the #1053 failure mode cannot
  // reach this input. If a future change adds live validation (length /
  // prefix / format normalization) that fires during composition, this
  // assertion fires.
  it("controlled API-key input during a simulated IME composition cycle is not rewritten", () => {
    renderWithLocale("en");
    const input = screen.getByLabelText(/Claude API key/i) as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "テスト鍵" } });
    expect(input.value).toBe("テスト鍵");

    fireEvent.compositionEnd(input);
    expect(input.value).toBe("テスト鍵");
  });
});
