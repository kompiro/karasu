import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GALLERY_PAGES } from "./examples-manifest.ts";
import { collectAnchors, extractTitle } from "./markdown.ts";
import { extractLinkTargets } from "./rewrite.ts";
import { galleryRouteOf, type Locale, routeOf } from "./site-map.ts";
import { listSources, PKG_ROOT } from "../sources.ts";

// The splash home pages are copied verbatim (sync.ts copyHomePages), and
// check-links walks only docs/ sources, so a route-relative link on the home
// page that points at a renamed page or heading would 404 silently on the site
// (TPL-1621). The four-register line (#2937) links into a spec section and a
// gallery page; this resolves every in-site link on both home pages.

const HOMES: ReadonlyArray<{ file: string; locale: Locale; route: string }> = [
  { file: "en.md", locale: "en", route: "" },
  { file: "ja.md", locale: "ja", route: "ja/" },
];

/** route -> anchors for every synced docs page; gallery routes carry no anchors. */
function siteRoutes(): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  for (const { docsRel, absPath } of listSources()) {
    const { title, body } = extractTitle(readFileSync(absPath, "utf8"));
    routes.set(routeOf(docsRel), collectAnchors(body, title));
  }
  for (const locale of ["en", "ja"] as const) {
    routes.set(galleryRouteOf(locale), new Set());
    for (const page of GALLERY_PAGES) routes.set(galleryRouteOf(locale, page.slug), new Set());
  }
  return routes;
}

describe("home page in-site links resolve (TPL-1621)", () => {
  const routes = siteRoutes();
  const links = HOMES.flatMap(({ file, locale, route }) => {
    const body = readFileSync(path.join(PKG_ROOT, "home", file), "utf8");
    return extractLinkTargets(body)
      .filter((t) => !/^[a-z]+:/i.test(t) && !t.startsWith("/") && !t.startsWith("#"))
      .map((target) => ({ locale, route, target }));
  });

  it("finds the four-register links on both home pages", () => {
    for (const locale of ["en", "ja"] as const) {
      const targets = links.filter((l) => l.locale === locale).map((l) => l.target);
      expect(targets.some((t) => t.startsWith("spec/tags-annotations/#"))).toBe(true);
      expect(targets).toContain("examples/grouping-and-membership/");
    }
  });

  it.each(links)("$locale home -> $target (page)", ({ route, target }) => {
    expect([...routes.keys()]).toContain(route + target.split("#")[0]);
  });

  it.each(links.filter((l) => l.target.includes("#")))(
    "$locale home -> $target (anchor)",
    ({ route, target }) => {
      const [pathPart, anchor] = target.split("#");
      expect([...(routes.get(route + pathPart) ?? [])]).toContain(anchor);
    },
  );
});
