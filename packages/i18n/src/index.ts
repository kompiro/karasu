/**
 * `@karasu-tools/i18n` — the React-free i18n runtime shared by the app,
 * the language server, and the CLI.
 *
 * Holds the single source of truth for translatable strings (`Translations`
 * type, `en` / `ja` maps), the locale-aware `translate()` lookup, and the
 * pure renderers that turn core `Warning` / `Diagnostic` objects into
 * user-facing text.
 *
 * Reading the environment's raw language tag (browser storage, LSP init
 * params, the `LC_ALL` / `LC_MESSAGES` / `LANG` chain) lives next to each
 * consumer; normalizing that tag to a `Locale` is shared here as
 * `resolveLocaleTag`.
 */

export type { Translations, TranslationParams } from "./types.js";
export type { Locale } from "./locale.js";
export { isLocale, resolveLocaleTag } from "./locale.js";
export { en } from "./en.js";
export { ja } from "./ja.js";
export { translate, bindTranslate, type TranslateFn } from "./translate.js";
export { renderWarning } from "./render-warning.js";
export { renderDiagnostic } from "./render-diagnostic.js";
