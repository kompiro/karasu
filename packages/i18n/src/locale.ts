/**
 * Locale primitives shared across every karasu consumer (app, lsp, cli, vscode).
 *
 * This module is intentionally environment-agnostic: it carries the `Locale`
 * union, the `isLocale` type guard, and `resolveLocaleTag`: the one rule that
 * turns a raw language tag into a `Locale`. Reading that raw tag stays next to
 * each consumer, because only the source differs:
 *   - app: `localStorage` + `navigator.language` (`packages/app/src/i18n/locale.ts`)
 *   - lsp: the `initialize` request's `locale` param
 *   - cli: the `LC_ALL` / `LC_MESSAGES` / `LANG` environment variables
 *   - vscode: `vscode.env.language` (`packages/vscode/src/webview-i18n.ts`)
 */

export type Locale = "en" | "ja";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}

/**
 * Normalize a raw language tag to a karasu `Locale`.
 *
 * Accepts anything a host environment reports as its display language:
 * BCP-47 tags (`"ja"`, `"ja-JP"`, `"en-US"`), POSIX locale strings
 * (`"ja_JP.UTF-8"`, `"C"`), or nothing at all (`""` / `null` / `undefined`,
 * which several sources return when unset). A tag that starts with `ja`
 * (case-insensitively) resolves to Japanese; everything else falls back to
 * English, the tooling-output default from `docs/spec/i18n.md`.
 *
 * Every consumer delegates here, so changing how Japanese is matched is one
 * edit rather than one per surface. Note the scope of that guarantee: this
 * function owns the *matching rule*, not the `Locale` union — adding a third
 * locale also touches `isLocale`, the `MAPS` dispatch in `translate.ts`, and
 * the other sites that enumerate `"en" | "ja"`.
 *
 * The prefix match is inherited from the four inline copies this replaced,
 * and it over-matches: `"jav"` (Javanese) and `"jam"` (Jamaican Creole) also
 * resolve to Japanese. It does catch Windows' `"Japanese_Japan.932"` form,
 * which an exact primary-subtag match would miss. Issue #2535 decides the
 * boundary; `locale.test.ts` pins today's answer either way.
 */
export function resolveLocaleTag(raw: string | null | undefined): Locale {
  return (raw ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}
