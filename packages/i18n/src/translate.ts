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
 * Argument tuple accepted by a locale-bound translator call: string-valued
 * keys take exactly the key, function-valued (parameterized) keys require
 * the params object their entry declares. Shared by `TranslateFn`,
 * `translate`, and `bindTranslate` so the contract lives in one place.
 */
export type TranslateArgs<K extends keyof Translations> = Translations[K] extends string
  ? [key: K]
  : [key: K, params: TranslationParams<K>];

/**
 * Locale-bound translator signature used by `renderWarning` /
 * `renderDiagnostic`. Matches the call shape of the `t` returned by the
 * app's `useTranslation`, but lets non-React consumers (lsp / cli) and
 * tests invoke it directly.
 */
export type TranslateFn = <K extends keyof Translations>(...args: TranslateArgs<K>) => string;

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
  ...args: TranslateArgs<K>
): string {
  // The conditional tuple cannot be destructured while K is unresolved;
  // widen once here. The public signature above keeps callers type-safe.
  const [key, params] = args as [K, unknown?];
  const activeMap = MAPS[locale];
  const entry = activeMap[key] ?? en[key];

  if (typeof entry === "function") {
    return (entry as (p: unknown) => string)(params);
  }
  return entry;
}

/**
 * Bind `translate` to a fixed locale, producing the `TranslateFn` shape
 * consumed by `renderWarning` / `renderDiagnostic`. Replaces the
 * hand-rolled `as TranslateFn` binding closures previously copy-pasted
 * across lsp / cli / app / tests.
 */
export function bindTranslate(locale: Locale): TranslateFn {
  return <K extends keyof Translations>(...args: TranslateArgs<K>) => translate<K>(locale, ...args);
}
