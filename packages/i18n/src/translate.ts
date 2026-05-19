/**
 * Locale-aware translation lookup.
 *
 * `translate(locale, key, params)` resolves a translation key against the
 * requested locale, falling back to English when the key is missing in the
 * active map. Parameterized values (function-valued keys) are invoked with
 * `params`.
 *
 * This is the React-free core of the i18n runtime. The app wraps it in a
 * `useTranslation()` React hook; the lsp / cli call it directly.
 */

import type { Locale } from "./locale.js";
import type { Translations } from "./types.js";
import { en } from "./en.js";
import { ja } from "./ja.js";

const MAPS: Record<Locale, Partial<Translations>> = { en, ja };

/**
 * Resolve a translation key against the active locale, falling back to
 * English when the key is missing in the active map. If the resolved
 * value is a function (parameterized), invoke it with `params`.
 */
export function translate<K extends keyof Translations>(
  locale: Locale,
  key: K,
  params?: unknown,
): string {
  const activeMap = MAPS[locale];
  const entry = activeMap[key] ?? en[key];

  if (typeof entry === "function") {
    return (entry as (p: unknown) => string)(params);
  }
  return entry;
}
