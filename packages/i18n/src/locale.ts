/**
 * Locale primitives shared across every karasu consumer (app, lsp, cli).
 *
 * This module is intentionally environment-agnostic: it carries only the
 * `Locale` union and the `isLocale` type guard. Environment-specific
 * resolution lives next to each consumer:
 *   - app: `localStorage` + `navigator.language` (`packages/app/src/i18n/locale.ts`)
 *   - lsp: the `initialize` request's `locale` param
 *   - cli: the `LANG` / `LC_ALL` environment variables
 */

export type Locale = "en" | "ja";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}
