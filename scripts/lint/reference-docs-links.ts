/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DOCS_SITE_ROUTES } from "../../packages/app/src/utils/docs-site-links.ts";
import { GALLERY_PAGES } from "../../packages/docs-site/scripts/lib/examples-manifest.ts";
import { PUBLISHED_EN_FILES, routeOf } from "../../packages/docs-site/scripts/lib/site-map.ts";

// Guards the Reference signpost's outbound links (Issue #2350) against the pages
// the docs site actually publishes.
//
// The signpost is the reference's only way out to the material that says *when*
// you would write a form and *what it renders as*. Its targets are hardcoded
// absolute URLs in the app, which no existing check covers: docs-site's
// `check-links` validates links *inside* docs/, and stops at the site boundary
// on purpose (TPL-1621). So a page dropped from `PUBLISHED_EN_FILES`, or renamed,
// takes the signpost to a 404 with every test still green — the same silent
// class of drift as an app shortcut missing from docs/tools (TPL-1716).
//
// Two things are asserted for every route in `DOCS_SITE_ROUTES`:
//
// 1. **It resolves, in both locales.** The published set is derived from the
//    site's own single sources (`PUBLISHED_EN_FILES` + `routeOf`, and
//    `GALLERY_PAGES` for the generated gallery), never transcribed here.
// 2. **It carries no `#fragment`.** A heading's slug differs per locale, so an
//    anchor rots into landing the reader in the wrong place while the link still
//    resolves. Page-level linking is the decision; this makes it enforced.

export interface Problem {
  key: string;
  route: string;
  message: string;
}

/**
 * Every base-relative route the docs site serves, both locales.
 *
 * A `ja/` route is only real when the `.ja.md` sibling exists on disk — that is
 * the same condition `listSources()` applies when it decides what to publish, so
 * it is checked against the filesystem rather than assumed.
 *
 * The gallery is generated, not synced from docs/: `sync.ts` always writes both
 * `examples.md` and `ja/examples.md` plus a page per `GALLERY_PAGES` entry, so
 * both locales exist unconditionally for those.
 */
export function publishedRoutes(repoRoot: string): Set<string> {
  const routes = new Set<string>();
  for (const enRel of PUBLISHED_EN_FILES) {
    routes.add(routeOf(enRel));
    const jaRel = enRel.replace(/\.md$/, ".ja.md");
    if (existsSync(resolve(repoRoot, "docs", jaRel))) routes.add(routeOf(jaRel));
  }
  for (const prefix of ["", "ja/"]) {
    routes.add(`${prefix}examples/`);
    for (const page of GALLERY_PAGES) routes.add(`${prefix}examples/${page.slug}/`);
  }
  return routes;
}

/** Locale prefix applied by `docsSiteUrl` — kept here so the guard checks the
 *  URLs the app actually emits, not just the bare routes. */
const LOCALE_PREFIX: Record<string, string> = { en: "", ja: "ja/" };

export function check(
  repoRoot: string,
  routes: Readonly<Record<string, string>> = DOCS_SITE_ROUTES,
  published: ReadonlySet<string> = publishedRoutes(repoRoot),
): Problem[] {
  const problems: Problem[] = [];

  for (const [key, route] of Object.entries(routes)) {
    if (route.includes("#")) {
      problems.push({
        key,
        route,
        message:
          "carries a #fragment. Link page-level only: a heading slug differs per locale, " +
          "so the anchor silently lands the reader in the wrong place (TPL-1621).",
      });
      continue;
    }
    const missingIn = Object.entries(LOCALE_PREFIX)
      .filter(([, prefix]) => !published.has(`${prefix}${route}`))
      .map(([locale]) => locale);
    if (missingIn.length > 0) {
      problems.push({
        key,
        route,
        message: `is not a published docs-site page in: ${missingIn.join(", ")}`,
      });
    }
  }
  return problems;
}

function main(): void {
  const problems = check(process.cwd());
  if (problems.length > 0) {
    console.error(`reference-docs-links: ${problems.length} broken signpost link(s):`);
    for (const p of problems) {
      console.error(`✗ DOCS_SITE_ROUTES.${p.key} ("${p.route}") ${p.message}`);
    }
    console.error(
      "\nFix the route in packages/app/src/utils/docs-site-links.ts, or publish the page " +
        "by adding it to PUBLISHED_EN_FILES in packages/docs-site/scripts/lib/site-map.ts.",
    );
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
