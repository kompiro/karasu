/**
 * Translations — the single source of truth for all translatable strings
 * in the karasu app.
 *
 * Each key maps to one of:
 *   - `string`                              : a static phrase (no interpolation)
 *   - `(params: {...}) => string`           : a phrase with typed interpolation
 *
 * Per `docs/design/i18n-support.md`, the locale files (`en.ts`, `ja.ts`)
 * implement this map. The `en.ts` file must be complete (this is what the
 * TypeScript type enforces). The `ja.ts` file may be partial; any key
 * missing in `ja.ts` falls through to the English value at render time.
 *
 * Keys are added incrementally as each app subsystem is translated in the
 * rollout phases documented in `docs/design/i18n-support.md`.
 * Phase A (this file's initial version) seeds the map with the strings
 * needed by the language selector itself, so Phase C1 (toolbar + selector)
 * can consume them immediately.
 */

export type Translations = {
  "languageSelector.label": string;
  "languageSelector.english": string;
  "languageSelector.japanese": string;
};

/**
 * Params accepted by a translation key, inferred from the value type.
 * `never` for string-valued keys (they take no params).
 */
export type TranslationParams<K extends keyof Translations> = Translations[K] extends (
  params: infer P,
) => string
  ? P
  : never;
