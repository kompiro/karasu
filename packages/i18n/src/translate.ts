/**
 * Locale-aware translation lookup.
 *
 * `translate(locale, key, params)` resolves a translation key against the
 * requested locale, falling back to English when the key is missing in the
 * active map. Parameterized values (function-valued keys) are invoked with
 * `params`.
 *
 * This is the React-free core of the i18n runtime. The app wraps it in a
 * `useTranslation()` React hook; the lsp / cli bind it once per pass via
 * `bindTranslate()`.
 */

import type { Locale } from "./locale.js";
import type { TranslationParams, Translations } from "./types.js";
import { en } from "./en.js";
import { ja } from "./ja.js";

const MAPS: Record<Locale, Partial<Translations>> = { en, ja };

/**
 * Locale-bound translator signature used by `renderWarning` /
 * `renderDiagnostic`. Matches the call shape of the `t` returned by the
 * app's `useTranslation`, but lets non-React consumers (lsp / cli) and
 * tests invoke it directly. String-valued keys take exactly one arg;
 * function-valued (parameterized) keys require a params object.
 */
export type TranslateFn = <K extends keyof Translations>(
  ...args: Translations[K] extends string ? [key: K] : [key: K, params: TranslationParams<K>]
) => string;

// Untyped lookup core shared by `translate` / `bindTranslate`. The public
// signatures re-establish per-key type safety; this widening stays private
// to this module.
function lookup(locale: Locale, key: keyof Translations, params?: unknown): string {
  const activeMap = MAPS[locale];
  const entry = activeMap[key] ?? en[key];

  if (typeof entry === "function") {
    return (entry as (p: unknown) => string)(params);
  }
  return entry;
}

/**
 * Resolve a translation key against the active locale, falling back to
 * English when the key is missing in the active map. If the resolved
 * value is a function (parameterized), invoke it with `params`.
 *
 * The conditional-tuple rest param ties `params` to `key`: string-valued
 * keys take no params, function-valued keys require exactly the params
 * object their entry declares.
 */
export function translate<K extends keyof Translations>(
  locale: Locale,
  ...args: Translations[K] extends string ? [key: K] : [key: K, params: TranslationParams<K>]
): string {
  // The conditional tuple cannot be destructured while K is unresolved;
  // widen once here. The public signature above keeps callers type-safe.
  const [key, params] = args as [K, unknown?];
  return lookup(locale, key, params);
}

/**
 * Bind `translate` to a fixed locale, producing the `TranslateFn` shape
 * consumed by `renderWarning` / `renderDiagnostic`. Replaces the
 * hand-rolled `as TranslateFn` binding closures previously copy-pasted
 * across lsp / cli / app / tests.
 */
export function bindTranslate(locale: Locale): TranslateFn {
  return <K extends keyof Translations>(
    ...args: Translations[K] extends string ? [key: K] : [key: K, params: TranslationParams<K>]
  ) => {
    // Same widening as `translate` — the conditional tuple cannot be
    // destructured or spread while K is unresolved.
    const [key, params] = args as [K, unknown?];
    return lookup(locale, key, params);
  };
}
