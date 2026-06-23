// Single source of truth for which docs/ files are published on the site and how
// each maps to a site route / content-collection path. Pure (no fs) so it is unit
// testable and shared by the sync and link-check steps.

import path from "node:path";

export const REPO_SLUG = "kompiro/karasu";
export const REPO_BRANCH = "main";

/**
 * docs-relative paths (POSIX) of the English base files published on the site.
 * Each `.ja.md` sibling, when it exists on disk, is published as the `ja` locale
 * page. Phase 1 scope: guides + syntax/style/tags reference + concepts.
 */
export const PUBLISHED_EN_FILES: readonly string[] = [
  "concepts.md",
  "tools/app.md",
  "tools/cli.md",
  "guide/README.md",
  "guide/01-service-team-design.md",
  "guide/02-onboarding.md",
  "guide/03-evolution.md",
  "guide/04-access-paths.md",
  "guide/05-communicating-diagrams.md",
  "spec/syntax.md",
  "spec/style.md",
  "spec/tags-annotations.md",
];

type Locale = "en" | "ja";

function stripExt(docsRel: string): string {
  return docsRel.replace(/\.ja\.md$/, "").replace(/\.md$/, "");
}

function localeOf(docsRel: string): Locale {
  return /\.ja\.md$/.test(docsRel) ? "ja" : "en";
}

/** A README/index file becomes its directory's section index page. */
function isIndex(docsRel: string): boolean {
  const base = path.posix.basename(stripExt(docsRel));
  return base === "README" || base === "index";
}

/** Locale-independent slug, e.g. "guide/01-service-team-design"; "guide" for the section index. */
export function slugOf(docsRel: string): string {
  const noExt = stripExt(docsRel);
  if (isIndex(docsRel)) {
    const dir = path.posix.dirname(noExt);
    return dir === "." ? "" : dir;
  }
  return noExt;
}

/**
 * Base-relative site route with a trailing slash and no leading slash, e.g.
 * "guide/01-service-team-design/" (en) or "ja/spec/syntax/" (ja). The GitHub
 * Pages base path (`/karasu/`) is NOT included — links are emitted route-relative
 * so the base is resolved by the browser at runtime.
 */
export function routeOf(docsRel: string): string {
  const slug = slugOf(docsRel);
  const core = slug === "" ? "" : `${slug}/`;
  return localeOf(docsRel) === "ja" ? `ja/${core}` : core;
}

/** Path under `src/content/docs`, e.g. "ja/guide/01-service-team-design.md". */
export function contentPathOf(docsRel: string): string {
  const slug = slugOf(docsRel);
  const file = isIndex(docsRel) ? (slug === "" ? "index" : `${slug}/index`) : slug;
  return localeOf(docsRel) === "ja" ? `ja/${file}.md` : `${file}.md`;
}

/**
 * Relative URL from one site route to another, base-agnostic. Both inputs are
 * base-relative routes with trailing slashes; the result is what an `<a href>`
 * on the `from` page must use to reach `to`. Because the count of `../` is based
 * only on the route segments (not the Pages base), the same link is correct
 * whether the site is served at `/` or `/karasu/`.
 */
export function routeRelative(fromRoute: string, toRoute: string): string {
  const fromSegs = fromRoute.split("/").filter(Boolean);
  const ups = "../".repeat(fromSegs.length);
  const rel = ups + toRoute;
  return rel === "" ? "./" : rel;
}
