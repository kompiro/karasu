/**
 * Browser locale resolution for the karasu app.
 *
 * Resolution order (per ADR-20260420-03):
 *   localStorage['karasu-locale'] → navigator.language → 'en' fallback
 *
 * The `Locale` type and `isLocale` guard now live in `@karasu-tools/i18n`,
 * shared with the lsp / cli. This module keeps only the browser-specific
 * resolution (localStorage + navigator).
 */

import { isLocale, type Locale } from "@karasu-tools/i18n";

export type { Locale };

const STORAGE_KEY = "karasu-locale";

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
