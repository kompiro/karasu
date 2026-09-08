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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
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

/**
 * `useSyncExternalStore` adapter over `prefers-color-scheme`.
 *
 * `getSystemTheme` must be referentially stable for equal states, which it is:
 * it returns one of two string literals. The server snapshot mirrors
 * `resolveEffectiveTheme`'s rule of defaulting to dark when the query cannot
 * be read, so a render without `matchMedia` matches what the DOM would get.
 */
function subscribeToColorScheme(onStoreChange: () => void): () => void {
  const query = colorSchemeQuery();
  if (!query) return () => {};
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSystemTheme(): EffectiveTheme {
  return resolveEffectiveTheme("system");
}

function getSystemThemeOnServer(): EffectiveTheme {
  return "dark";
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => initialTheme ?? resolveThemePreference(),
  );
  // The OS setting is external state, so read it through the store API rather
  // than mirroring it into `useState` from an effect: the effect form rendered
  // once with the old value and corrected itself on the next commit, which is
  // the cascading render `react(set-state-in-effect)` points at.
  const systemTheme = useSyncExternalStore(
    subscribeToColorScheme,
    getSystemTheme,
    getSystemThemeOnServer,
  );
  const effectiveTheme: EffectiveTheme = theme === "system" ? systemTheme : theme;

  // Writing `<html data-theme>` is a real side effect and stays in an effect.
  useEffect(() => {
    applyEffectiveTheme(effectiveTheme);
  }, [effectiveTheme]);

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
