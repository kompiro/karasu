/**
 * Locale resolution for karasu app.
 *
 * Follows the design in docs/design/i18n-support.md:
 *   localStorage['karasu-locale'] → navigator.language → 'en' fallback
 *
 * This file is introduced ahead of the full i18n infrastructure (#34) to
 * unblock the Chat system prompt localization (#639). When #34 lands and
 * the Translations map is introduced, this module will move under
 * packages/i18n/ without changing its public API.
 */

export type Locale = "en" | "ja";

const STORAGE_KEY = "karasu-locale";

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}

function readStoredLocale(): Locale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language ?? "";
  return lang.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function resolveLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  return detectBrowserLocale();
}

export function setLocale(locale: Locale): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore — storage may be disabled (e.g. Safari private mode).
  }
}
