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
 * Normalize a raw language tag to a karasu `Locale`.
 *
 * Accepts anything a host environment reports as its display language:
 * BCP-47 tags (`"ja"`, `"ja-JP"`, `"en-US"`), POSIX locale strings
 * (`"ja_JP.UTF-8"`, `"C"`), or nothing at all. A tag that starts with `ja`
 * (case-insensitively) resolves to Japanese; everything else falls back to
 * English, the tooling-output default from `docs/spec/i18n.md`.
 *
 * Every consumer delegates here so the Japanese-matching rule has a single
 * owner: a new BCP-47 form or a third locale is one edit, not four.
 */
export function resolveLocaleTag(raw: string | undefined): Locale {
  return (raw ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}
