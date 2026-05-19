/**
 * `@karasu-tools/i18n` — the React-free i18n runtime shared by the app,
 * the language server, and the CLI.
 *
 * Holds the single source of truth for translatable strings (`Translations`
 * type, `en` / `ja` maps), the locale-aware `translate()` lookup, and the
 * pure renderers that turn core `Warning` / `Diagnostic` objects into
 * user-facing text.
 *
 * Environment-specific locale resolution (browser storage, LSP init params,
 * `LANG`) lives next to each consumer, not here.
 */

export type { Translations, TranslationParams } from "./types.js";
export type { Locale } from "./locale.js";
export { isLocale } from "./locale.js";
export { en } from "./en.js";
export { ja } from "./ja.js";
export { translate } from "./translate.js";
export { renderWarning, type TranslateFn } from "./render-warning.js";
export { renderDiagnostic } from "./render-diagnostic.js";
