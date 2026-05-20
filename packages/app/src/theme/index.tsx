/**
 * Theme entry point (app React layer).
 *
 * `theme-storage.ts` holds the framework-free resolution & persistence.
 * This module adds the React layer:
 *
 *   - `ThemeProvider`: wrap the app root. Applies the effective theme to
 *     `<html data-theme>`, persists preference changes, and — while the
 *     preference is `"system"` — tracks `prefers-color-scheme` live.
 *   - `useTheme`: hook returning `{ theme, effectiveTheme, setTheme }`.
 *     `theme` is the user preference (light/dark/system); `effectiveTheme`
 *     is the concrete light/dark actually applied.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  applyEffectiveTheme,
  colorSchemeQuery,
  resolveEffectiveTheme,
  resolveThemePreference,
  setStoredTheme,
  type EffectiveTheme,
  type ThemePreference,
} from "./theme-storage.js";

export type { ThemePreference } from "./theme-storage.js";

type SetTheme = (preference: ThemePreference) => void;

interface ThemeContextValue {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setTheme: SetTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Override the initial preference. Primarily for tests; in production,
   * omit this and let the provider resolve from storage.
   */
  initialTheme?: ThemePreference;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => initialTheme ?? resolveThemePreference(),
  );
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveEffectiveTheme(initialTheme ?? resolveThemePreference()),
  );

  // Apply the effective theme whenever the preference changes, and — when
  // the preference is "system" — keep it in sync with the OS setting.
  useEffect(() => {
    const next = resolveEffectiveTheme(theme);
    setEffectiveTheme(next);
    applyEffectiveTheme(next);

    if (theme !== "system") return;
    const query = colorSchemeQuery();
    if (!query) return;
    const onChange = () => {
      const live = resolveEffectiveTheme("system");
      setEffectiveTheme(live);
      applyEffectiveTheme(live);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback<SetTheme>((next) => {
    setStoredTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, effectiveTheme, setTheme }),
    [theme, effectiveTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
