import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GALLERY_PAGES, resolveSpecDoc } from "./examples-manifest.ts";
import { examplePageMarkdown, indexPageMarkdown } from "./gallery-pages.ts";
import { collectAnchors, extractTitle } from "./markdown.ts";
import type { RenderedDiagram } from "./render-examples.ts";
import { PUBLISHED_EN_FILES } from "./site-map.ts";
import { REPO_ROOT } from "../sources.ts";

const stub = (): RenderedDiagram => ({
  entry: "example.krs",
  source: "system Demo {}",
  views: [{ type: "system", svg: "<svg>x</svg>" }],
});

describe("gallery-pages", () => {
  it("index lists every page grouped, in both locales", () => {
    const en = indexPageMarkdown("en");
    expect(en).toContain("## Themed scenarios");
    for (const p of GALLERY_PAGES) expect(en).toContain(`](./${p.slug}/)`);
    expect(indexPageMarkdown("ja")).toContain("## テーマ別シナリオ");
  });

  it("single-example page embeds the view as a data-URI img with a source fence", () => {
    const page = GALLERY_PAGES.find((p) => p.slug === "payment-platform");
    if (!page) throw new Error("fixture missing");
    const md = examplePageMarkdown(page, [stub()], "en");
    expect(md).toContain('src="data:image/svg+xml,');
    expect(md).toContain("<figcaption>System view</figcaption>");
    expect(md).toContain("```krs");
    // payment-platform is localized: the en page links to the en source dir.
    expect(md).toContain("github.com/kompiro/karasu/tree/main/examples/en/payment-platform");
  });

  it("uses a fence longer than any backtick run in the source", () => {
    const page = GALLERY_PAGES.find((p) => p.slug === "payment-platform");
    if (!page) throw new Error("fixture missing");
    const withBackticks: RenderedDiagram = {
      entry: "example.krs",
      source: 'system Demo { description "```" }',
      views: [{ type: "system", svg: "<svg>x</svg>" }],
    };
    const md = examplePageMarkdown(page, [withBackticks], "en");
    expect(md).toContain("````krs"); // 4 backticks > the 3 in the source
    expect(md).toContain('description "```"'); // source preserved, fence not closed early
  });

  it("adds an 'Open in the app' link only for openable examples", () => {
    const payment = GALLERY_PAGES.find((p) => p.slug === "payment-platform");
    if (!payment) throw new Error("fixture missing");
    expect(examplePageMarkdown(payment, [stub()], "en")).toContain(
      "karasu.kompiro.dev/?example=payment-platform&lang=en",
    );

    const fs = GALLERY_PAGES.find((p) => p.slug === "feature-samples");
    if (!fs) throw new Error("fixture missing");
    expect(
      examplePageMarkdown(
        fs,
        fs.diagrams.map(() => stub()),
        "en",
      ),
    ).not.toContain("karasu.kompiro.dev/?example=");
  });

  it("feature-samples page renders one section per sample", () => {
    const page = GALLERY_PAGES.find((p) => p.slug === "feature-samples");
    if (!page) throw new Error("fixture missing");
    const md = examplePageMarkdown(
      page,
      page.diagrams.map(() => stub()),
      "ja",
    );
    for (const d of page.diagrams) expect(md).toContain(`## ${d.caption?.ja}`);
  });

  it("grouping-and-membership puts a note and a route-relative spec link under each diagram", () => {
    const page = GALLERY_PAGES.find((p) => p.slug === "grouping-and-membership");
    if (!page) throw new Error("fixture missing");
    const stubs = page.diagrams.map(() => stub());
    const en = examplePageMarkdown(page, stubs, "en");
    expect(en).toContain("Drawn with Group by: Boundary.");
    // /examples/grouping-and-membership/ -> /spec/syntax/
    expect(en).toContain("](../../spec/syntax/#grouping-the-system-view-boundary)");
    expect(en).toContain("](../../spec/syntax/#cross-cutting-membership-facet)");
    const ja = examplePageMarkdown(page, stubs, "ja");
    expect(ja).toContain("グループ化: 境界 で描いた");
    // /ja/examples/grouping-and-membership/ -> /ja/spec/syntax/
    expect(ja).toContain("](../../../ja/spec/syntax/#システムビューのグルーピングboundary)");
  });

  it("publishes each feature sample on one page only", () => {
    // tag-facet-registers moved from feature-samples to grouping-and-membership
    // (#2937); a copy left behind would show the same file twice, once without
    // the facet selection that is the point of the move.
    const entries = GALLERY_PAGES.flatMap((p) => p.diagrams.map((d) => JSON.stringify(d.entry)));
    expect(entries.length).toBe(new Set(entries).size);
  });
});

// Spec links on gallery pages are written into generated markdown, which
// check-links never sees (it walks docs/ sources only), so a renamed heading
// would 404 silently on the site (TPL-1621). Resolve every one against the
// docs source the site syncs from.
describe("gallery spec links resolve (TPL-1621)", () => {
  const refs = GALLERY_PAGES.flatMap((p) =>
    p.diagrams.flatMap((d) =>
      d.spec
        ? (["en", "ja"] as const).map((locale) => ({
            slug: p.slug,
            locale,
            doc: resolveSpecDoc(d.spec!, locale),
            published: PUBLISHED_EN_FILES.includes(d.spec!.doc),
            anchor: d.spec!.anchor[locale],
          }))
        : [],
    ),
  );

  it("has spec links to check", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs)("$slug ($locale) -> $doc#$anchor", ({ doc, published, anchor }) => {
    expect(published).toBe(true);
    const { title, body } = extractTitle(readFileSync(path.join(REPO_ROOT, "docs", doc), "utf8"));
    expect([...collectAnchors(body, title)]).toContain(anchor);
  });
});
