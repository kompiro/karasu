import { describe, expect, it } from "vitest";
import { GALLERY_PAGES } from "./examples-manifest.ts";
import { examplePageMarkdown, indexPageMarkdown } from "./gallery-pages.ts";
import type { RenderedDiagram } from "./render-examples.ts";

const stub = (entry: string): RenderedDiagram => ({
  entry,
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
    const md = examplePageMarkdown(page, [stub(page.diagrams[0].entry)], "en");
    expect(md).toContain('src="data:image/svg+xml,');
    expect(md).toContain("<figcaption>System view</figcaption>");
    expect(md).toContain("```krs");
    expect(md).toContain("github.com/kompiro/karasu/tree/main/examples/payment-platform");
  });

  it("feature-samples page renders one section per sample", () => {
    const page = GALLERY_PAGES.find((p) => p.slug === "feature-samples");
    if (!page) throw new Error("fixture missing");
    const md = examplePageMarkdown(
      page,
      page.diagrams.map((d) => stub(d.entry)),
      "ja",
    );
    for (const d of page.diagrams) expect(md).toContain(`## ${d.caption?.ja}`);
  });
});
