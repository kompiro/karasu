import type { Locale } from "../i18n/locale.js";

/**
 * Where the app links out to the published documentation site (GitHub Pages).
 * The single place that knows the site's base URL and the locale prefix, so the
 * Preview toolbar's Docs menu and the Reference signpost cannot drift apart.
 *
 * Starlight serves the Japanese docs under the `/ja/` locale prefix, so every
 * link follows the active app locale.
 */
const DOCS_SITE_BASE_URL = "https://kompiro.github.io/karasu/";

/**
 * The signpost targets: the two halves the Reference itself does not answer.
 * `guide` / `cookbook` say *when* you would reach for a form, `examples` shows
 * *what it looks like* rendered (#2350).
 *
 * Base-relative routes, trailing slash, no leading slash — the same shape
 * `routeOf()` produces in the docs site's `site-map.ts`, which is what
 * `scripts/lint/reference-docs-links.ts` checks these against.
 *
 * **No `#fragment`s.** A heading anchor's slug differs per locale (the ja slug
 * of `### \`client\` の \`capability\`` is not the en one), so an anchor that
 * drifts lands the reader in the wrong place while every link still resolves —
 * worse than a link to the top of the page (TPL-1621). The guard rejects any
 * route containing `#`, so this is enforced, not just documented.
 */
export const DOCS_SITE_ROUTES = {
  guide: "guide/",
  cookbook: "guide/notation-cookbook/",
  examples: "examples/",
} as const;

/**
 * Base-relative route in the given locale — the half of a docs-site URL that
 * `site-map.ts`'s `routeOf()` also produces. Split out from `docsSiteUrl` so the
 * drift guard resolves the *same* prefix rule the app applies, rather than a
 * transcription of it.
 */
export function localeRoute(locale: Locale, route: string): string {
  return `${locale === "ja" ? "ja/" : ""}${route}`;
}

/**
 * Absolute URL for a base-relative docs-site route in the active locale.
 *
 * Takes `Locale`, not `string`: a raw tag (`"ja-JP"`) would silently resolve to
 * the English page. Normalizing a raw tag is `resolveLocaleTag`'s job and its
 * alone (#2081), so an unnormalized value must not be able to reach here.
 */
export function docsSiteUrl(locale: Locale, route = ""): string {
  return `${DOCS_SITE_BASE_URL}${localeRoute(locale, route)}`;
}
