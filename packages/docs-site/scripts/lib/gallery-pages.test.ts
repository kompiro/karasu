import { describe, expect, it } from "vitest";
import { GALLERY_PAGES } from "./examples-manifest.ts";
import { examplePageMarkdown, indexPageMarkdown } from "./gallery-pages.ts";
import type { RenderedDiagram } from "./render-examples.ts";

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
    expect(md).toContain("github.com/kompiro/karasu/tree/main/examples/payment-platform");
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
});
