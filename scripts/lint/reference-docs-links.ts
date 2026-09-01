/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DOCS_SITE_ROUTES, localeRoute } from "../../packages/app/src/utils/docs-site-links.ts";
import { GALLERY_PAGES } from "../../packages/docs-site/scripts/lib/examples-manifest.ts";
import {
  galleryRouteOf,
  type Locale,
  routeOf,
} from "../../packages/docs-site/scripts/lib/site-map.ts";
import { listSources } from "../../packages/docs-site/scripts/sources.ts";

// Guards the Reference signpost's outbound links (Issue #2350) against the pages
// the docs site actually publishes.
//
// The signpost is the reference's only way out to the material that says *when*
// you would write a form and *what it renders as*. Its targets are absolute URLs
// baked into the app, which no existing check covers: docs-site's `check-links`
// validates links *inside* docs/, and stops at the site boundary on purpose
// (TPL-1621). So a page dropped from `PUBLISHED_EN_FILES`, or renamed, would
// take the signpost to a 404 with every test still green — the same silent class
// of drift as an app shortcut missing from docs/tools (TPL-1716).
//
// Three things are asserted:
//
// 1. **Every route resolves, in both locales.** The published set comes from the
//    site's own machinery — `listSources()` (which also throws when a listed en
//    page is gone) and `galleryRouteOf()`, the same helper `sync.ts` writes the
//    gallery through — so this file never transcribes where a page lives.
// 2. **No route carries a `#fragment`.** A heading's slug differs per locale, so
//    an anchor rots into landing the reader in the wrong place while the link
//    still resolves. Page-level linking is the decision; this makes it enforced.
// 3. **No other module builds a docs-site URL.** A literal pasted into a
//    component would satisfy 1 and 2 by never being looked at, so the base URL
//    is required to have exactly one owner and every link to flow through it.
//    (What this cannot see is a fragment appended to the *argument* at a call
//    site, `docsSiteUrl(locale, "guide/#x")`. Routes belong in
//    `DOCS_SITE_ROUTES`, where rule 2 covers them.)

const LOCALES: Locale[] = ["en", "ja"];

export const URL_OWNER = "packages/app/src/utils/docs-site-links.ts";
export const APP_SRC_DIR = "packages/app/src";
const DOCS_SITE_HOST = "kompiro.github.io/karasu";
const SOURCE_EXT_RE = /\.(tsx?|jsx?)$/;
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;

export interface Problem {
  where: string;
  message: string;
}

/**
 * Every base-relative route the docs site serves, both locales.
 *
 * `listSources()` is the site's own answer to "what gets published": each en
 * base file (throwing if it is missing from disk) plus its `.ja.md` sibling when
 * that exists. The gallery is generated rather than synced, so its routes come
 * from `galleryRouteOf` over `GALLERY_PAGES` — the helper `sync.ts` writes those
 * same pages through.
 */
export function publishedRoutes(): Set<string> {
  const routes = new Set(listSources().map((s) => routeOf(s.docsRel)));
  for (const locale of LOCALES) {
    routes.add(galleryRouteOf(locale));
    for (const page of GALLERY_PAGES) routes.add(galleryRouteOf(locale, page.slug));
  }
  return routes;
}

/** Recursively collect every source file under `dir` (skipping tests). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (SOURCE_EXT_RE.test(entry) && !TEST_FILE_RE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * App modules other than the owner that spell the docs-site host themselves.
 * `ownerRel` is a parameter so a test can withdraw the exemption and see the
 * scan actually report something.
 */
export function unownedUrlLiterals(repoRoot: string, ownerRel: string = URL_OWNER): string[] {
  const owner = resolve(repoRoot, ownerRel);
  return sourceFiles(resolve(repoRoot, APP_SRC_DIR))
    .filter((file) => file !== owner && readFileSync(file, "utf8").includes(DOCS_SITE_HOST))
    .map((file) => relative(repoRoot, file));
}

/** Where a route that failed to resolve is actually published from. */
function remediation(route: string): string {
  return route.startsWith("examples/")
    ? "Gallery pages are generated from GALLERY_PAGES in " +
        "packages/docs-site/scripts/lib/examples-manifest.ts — fix the slug, or add the page there."
    : "Publish the page by adding it to PUBLISHED_EN_FILES in " +
        "packages/docs-site/scripts/lib/site-map.ts, or fix the route.";
}

export function check(
  repoRoot: string,
  routes: Readonly<Record<string, string>> = DOCS_SITE_ROUTES,
  published: ReadonlySet<string> = publishedRoutes(),
): Problem[] {
  const problems: Problem[] = [];

  for (const [key, route] of Object.entries(routes)) {
    const where = `DOCS_SITE_ROUTES.${key} ("${route}")`;
    if (route.includes("#")) {
      problems.push({
        where,
        message:
          "carries a #fragment. Link page-level only: a heading slug differs per locale, " +
          "so the anchor silently lands the reader in the wrong place (TPL-1621).",
      });
      continue;
    }
    const missingIn = LOCALES.filter((locale) => !published.has(localeRoute(locale, route)));
    if (missingIn.length > 0) {
      problems.push({
        where,
        message: `is not a published docs-site page in: ${missingIn.join(", ")}. ${remediation(route)}`,
      });
    }
  }

  for (const file of unownedUrlLiterals(repoRoot)) {
    problems.push({
      where: file,
      message:
        `spells the docs-site URL itself. Build it with docsSiteUrl() from ${URL_OWNER} ` +
        "instead, so the link is covered by the checks above.",
    });
  }

  return problems;
}

function main(): void {
  const problems = check(process.cwd());
  if (problems.length > 0) {
    console.error(`reference-docs-links: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`✗ ${p.where} ${p.message}`);
    process.exit(1);
  }
  console.log("reference-docs-links: ok (every Reference signpost link is a published page)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /reference-docs-links\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
