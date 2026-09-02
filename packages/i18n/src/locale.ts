/**
 * Locale primitives shared across every karasu consumer (app, lsp, cli, vscode).
 *
 * This module is intentionally environment-agnostic: it carries the `Locale`
 * union, the `isLocale` type guard, and `resolveLocaleTag`: the one rule that
 * turns a raw language tag into a `Locale`. Reading that raw tag stays next to
 * each consumer, because only the source differs:
 *   - app: `localStorage` + `navigator.language` (`packages/app/src/i18n/locale.ts`)
 *   - lsp: the `initialize` request's `locale` param
 *   - cli: the `LANG` / `LC_ALL` environment variables
 *   - vscode: `vscode.env.language` (`packages/vscode/src/webview-i18n.ts`)
 */

export type Locale = "en" | "ja";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}

/**
 * Primary subtags that mean Japanese, matched whole rather than by prefix.
 *
 * `"japanese"` is here for Windows, which reports POSIX locales by English
 * language name: `"Japanese_Japan.932"`. It is not a BCP-47 subtag, so it has
 * to be listed rather than derived — that is the whole reason this is a set
 * and not an equality test against `"ja"`.
 */
const JAPANESE_PRIMARY_SUBTAGS = new Set(["ja", "japanese"]);

/**
 * Normalize a raw language tag to a karasu `Locale`.
 *
 * Accepts anything a host environment reports as its display language:
 * BCP-47 tags (`"ja"`, `"ja-JP"`, `"en-US"`), POSIX locale strings
 * (`"ja_JP.UTF-8"`, `"C"`), Windows' language-name form
 * (`"Japanese_Japan.932"`), or nothing at all (`""` / `null` / `undefined`,
 * which several sources return when unset). A tag whose primary subtag is
 * Japanese resolves to `"ja"`; everything else falls back to English, the
 * tooling-output default from `docs/spec/i18n.md`.
 *
 * Every consumer delegates here, so changing how Japanese is matched is one
 * edit rather than one per surface. Note the scope of that guarantee: this
 * function owns the *matching rule*, not the `Locale` union — adding a third
 * locale also touches `isLocale`, the `MAPS` dispatch in `translate.ts`, and
 * the other sites that enumerate `"en" | "ja"`.
 *
 * The match is on the whole primary subtag, not a prefix: `"jav"` (Javanese)
 * and `"jam"` (Jamaican Creole) are their own languages and resolve to
 * English. The prefix match this replaced claimed them for Japanese
 * (ADR-2535); `locale.test.ts` pins the boundary from both sides.
 */
export function resolveLocaleTag(raw: string | null | undefined): Locale {
  // BCP-47 (`ja-JP`), POSIX (`ja_JP.UTF-8`) and Windows (`Japanese_Japan.932`)
  // each separate the primary subtag with one of these three characters.
  const primary = (raw ?? "").toLowerCase().split(/[-_.]/, 1)[0];
  return JAPANESE_PRIMARY_SUBTAGS.has(primary) ? "ja" : "en";
}
