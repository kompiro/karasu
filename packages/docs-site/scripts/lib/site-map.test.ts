import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../sources.ts";
import { contentPathOf, PUBLISHED_EN_FILES, routeOf } from "./site-map.ts";

// PR-time fence for the published-pages set (AT-1710 / 1711 / 1712 / 1734 /
// 1818). Without this, the only guard that a registered doc actually exists on
// disk is listSources() throwing during the docs-site build — which runs solely
// in pages.yml (push to main), i.e. after merge. The route-algorithm tests in
// rewrite.test.ts use a local fixture set and never assert what the real
// PUBLISHED_EN_FILES contains.
describe("published pages", () => {
  it("publishes tools/app, tools/cli, spec/glossary, spec/diagnostics, notation-cookbook", () => {
    expect(PUBLISHED_EN_FILES).toContain("tools/app.md");
    expect(PUBLISHED_EN_FILES).toContain("tools/cli.md");
    expect(PUBLISHED_EN_FILES).toContain("spec/glossary.md");
    expect(PUBLISHED_EN_FILES).toContain("spec/diagnostics.md");
    expect(PUBLISHED_EN_FILES).toContain("guide/notation-cookbook.md");
  });

  it("every published en file exists on disk", () => {
    const missing = PUBLISHED_EN_FILES.filter(
      (rel) => !fs.existsSync(path.join(REPO_ROOT, "docs", rel)),
    );
    expect(missing).toEqual([]);
  });

  it("resolves each published page to its route + content path", () => {
    // Exact resolution for the pages fenced by their AT records.
    expect(routeOf("tools/app.md")).toBe("tools/app/");
    expect(contentPathOf("tools/app.md")).toBe("tools/app.md");
    expect(routeOf("tools/cli.md")).toBe("tools/cli/");
    expect(contentPathOf("tools/cli.md")).toBe("tools/cli.md");
    expect(routeOf("spec/glossary.md")).toBe("spec/glossary/");
    expect(contentPathOf("spec/glossary.md")).toBe("spec/glossary.md");
    expect(routeOf("spec/diagnostics.md")).toBe("spec/diagnostics/");
    expect(contentPathOf("spec/diagnostics.md")).toBe("spec/diagnostics.md");
    // The ja sibling (published when it exists on disk) gets the ja/ route.
    expect(routeOf("spec/diagnostics.ja.md")).toBe("ja/spec/diagnostics/");
    expect(routeOf("guide/notation-cookbook.md")).toBe("guide/notation-cookbook/");
    expect(contentPathOf("guide/notation-cookbook.md")).toBe("guide/notation-cookbook.md");

    // Every registered page resolves to a well-formed route (trailing slash,
    // no leading slash) and a .md content-collection path.
    const malformed = PUBLISHED_EN_FILES.map((rel) => ({
      rel,
      route: routeOf(rel),
      content: contentPathOf(rel),
    })).filter(
      ({ route, content }) =>
        !route.endsWith("/") || route.startsWith("/") || !content.endsWith(".md"),
    );
    expect(malformed).toEqual([]);
  });
});
