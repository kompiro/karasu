// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { ThemeProvider, useTheme, type ThemePreference } from "./index.js";

/**
 * Install a controllable `window.matchMedia`. Every call shares one
 * `matches` value and one listener set (closure), so the listener
 * `ThemeProvider` registers can be fired via the returned `setLight`.
 */
function installMatchMedia(initialLight: boolean) {
  let light = initialLight;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return light;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return {
    setLight(next: boolean) {
      light = next;
      for (const cb of listeners) cb();
    },
  };
}

/** A consumer that surfaces the theme context for end-to-end assertions. */
function ThemeProbe() {
  const { theme, effectiveTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="preference">{theme}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button type="button" onClick={() => setTheme("light")}>
        light
      </button>
      <button type="button" onClick={() => setTheme("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        system
      </button>
    </div>
  );
}

function renderProbe(initialTheme?: ThemePreference) {
  return render(
    <ThemeProvider initialTheme={initialTheme}>
      <ThemeProbe />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useTheme", () => {
  it("throws when used outside a ThemeProvider", () => {
    // The render error is expected; silence React's console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});

describe("ThemeProvider — explicit preference", () => {
  it("applies an explicit light preference to <html data-theme>", () => {
    renderProbe("light");
    expect(screen.getByTestId("preference").textContent).toBe("light");
    expect(screen.getByTestId("effective").textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies an explicit dark preference to <html data-theme>", () => {
    renderProbe("dark");
    expect(screen.getByTestId("effective").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("ThemeProvider — switching", () => {
  beforeEach(() => localStorage.clear());

  // TPL-20260518-01: a multi-state switch must drive BOTH result states
  // all the way to the final output (here, the documentElement attribute),
  // not just flip a boolean.
  it("drives both light and dark all the way to <html data-theme> and storage", () => {
    renderProbe("dark");

    act(() => screen.getByRole("button", { name: "light" }).click());
    expect(screen.getByTestId("effective").textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("karasu-theme")).toBe("light");

    act(() => screen.getByRole("button", { name: "dark" }).click());
    expect(screen.getByTestId("effective").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("karasu-theme")).toBe("dark");
  });
});

describe("ThemeProvider — system preference", () => {
  it("follows prefers-color-scheme when the preference is 'system'", () => {
    installMatchMedia(true); // OS = light
    renderProbe("system");
    expect(screen.getByTestId("effective").textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("live-updates when the OS scheme changes and the preference is 'system'", () => {
    const media = installMatchMedia(false); // OS = dark
    renderProbe("system");
    expect(screen.getByTestId("effective").textContent).toBe("dark");

    act(() => media.setLight(true));
    expect(screen.getByTestId("effective").textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores OS changes once an explicit preference is chosen", () => {
    const media = installMatchMedia(false);
    renderProbe("system");

    act(() => screen.getByRole("button", { name: "dark" }).click());
    expect(screen.getByTestId("effective").textContent).toBe("dark");

    // OS flips to light, but the explicit 'dark' preference must win.
    act(() => media.setLight(true));
    expect(screen.getByTestId("effective").textContent).toBe("dark");
  });
});
