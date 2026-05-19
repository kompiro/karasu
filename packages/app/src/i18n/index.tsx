/**
 * i18n entry point (app React layer).
 *
 * The translation data and lookup (`Translations`, `en` / `ja`,
 * `translate`) live in `@karasu-tools/i18n`, shared with the lsp / cli.
 * This module adds the app-specific React layer on top:
 *
 *   - `LocaleProvider`: wrap the app root to make the locale available to
 *     descendants. Persists changes via `setStoredLocale()` and notifies
 *     subscribers so UI re-renders on switch.
 *   - `useTranslation`: hook returning `{ t, locale, setLocale }`.
 *     `t(key)` for string-valued translations, `t(key, params)` for
 *     function-valued ones. Type enforces the correct arity per key.
 *
 * `translate` is re-exported for non-React callers inside the app
 * (e.g. `useEmptyStateLabels`).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { translate, type Translations, type TranslationParams } from "@karasu-tools/i18n";
import { resolveLocale, setLocale as setStoredLocale, type Locale } from "./locale.js";

export { translate };

type SetLocale = (locale: Locale) => void;

interface LocaleContextValue {
  locale: Locale;
  setLocale: SetLocale;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  children: ReactNode;
  /**
   * Override the initial locale. Primarily for tests; in production, omit
   * this and let the provider resolve from storage / browser.
   */
  initialLocale?: Locale;
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? resolveLocale());

  const setLocale = useCallback<SetLocale>((next) => {
    setStoredLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// Overloads: parameterless keys take exactly one arg, parameterized keys require a params object.
interface UseTranslationResult {
  locale: Locale;
  setLocale: SetLocale;
  t<K extends keyof Translations>(
    ...args: Translations[K] extends string ? [key: K] : [key: K, params: TranslationParams<K>]
  ): string;
}

export function useTranslation(): UseTranslationResult {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useTranslation must be used inside <LocaleProvider>");
  }

  const { locale, setLocale } = ctx;

  const t = useCallback<UseTranslationResult["t"]>(
    // The overloaded signature narrows for callers; the underlying
    // implementation accepts either shape.
    ((key: keyof Translations, params?: unknown) =>
      translate(locale, key, params)) as UseTranslationResult["t"],
    [locale],
  );

  return { locale, setLocale, t };
}
