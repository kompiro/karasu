/**
 * Theme resolution & persistence for the karasu app.
 *
 * A *preference* is what the user picked: `"light"`, `"dark"`, or
 * `"system"` (follow the OS). The *effective theme* is the concrete
 * `"light"` / `"dark"` actually applied — for `"system"` it is derived
 * from `prefers-color-scheme`.
 *
 * Resolution order:
 *   localStorage['karasu-theme'] → "system"
 *
 * The effective theme is written to `document.documentElement`'s
 * `data-theme` attribute; `themes.css` keys its light overrides off it.
 * The inline boot script in `index.html` applies the same logic before
 * first paint to avoid a flash; this module is the runtime counterpart
 * and MUST stay in sync with that script.
 */

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const STORAGE_KEY = "karasu-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): ThemePreference | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

/** The persisted preference, or `"system"` when nothing is stored. */
export function resolveThemePreference(): ThemePreference {
  return readStoredTheme() ?? "system";
}

export function setStoredTheme(preference: ThemePreference): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Ignore — storage may be disabled (e.g. Safari private mode).
  }
}

/**
 * The `prefers-color-scheme` media query, or `null` when `matchMedia` is
 * unavailable (jsdom, very old browsers).
 */
export function colorSchemeQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia("(prefers-color-scheme: light)");
}

/** Resolve a preference to the concrete theme to apply. */
export function resolveEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference !== "system") return preference;
  // Default to dark when the OS preference cannot be read.
  return colorSchemeQuery()?.matches ? "light" : "dark";
}

/** Write the effective theme onto `<html data-theme>`. */
export function applyEffectiveTheme(theme: EffectiveTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
