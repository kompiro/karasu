import { describe, expect, it } from "vitest";
import { GALLERY_PAGES, resolveEntry, type Locale } from "./examples-manifest.ts";
import { renderDiagram } from "./render-examples.ts";

function entryOf(slug: string, locale: Locale): string {
  const page = GALLERY_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`fixture missing: ${slug}`);
  return resolveEntry(page.diagrams[0].entry, locale);
}

// PR-time guard (docs-site build runs only in pages.yml): every example in the
// manifest — for both locales — must compile and yield at least one non-empty
// view, so a broken or renamed example fails the build before it ships.
describe("examples gallery rendering", () => {
  const entries = [
    ...new Set(
      GALLERY_PAGES.flatMap((p) =>
        p.diagrams.flatMap((d) => [resolveEntry(d.entry, "en"), resolveEntry(d.entry, "ja")]),
      ),
    ),
  ];

  it.each(entries)("renders %s to at least one non-empty view", async (entry) => {
    const rendered = await renderDiagram(entry);
    expect(rendered.source.length).toBeGreaterThan(0);
    expect(rendered.views.length).toBeGreaterThan(0);
    for (const view of rendered.views) {
      expect(view.svg).toContain("<svg");
      expect(view.svg.length).toBeGreaterThan(200);
    }
  });
});

// The smoke pass above only proves "at least one view" — an empty-view SVG is
// still >200 chars and contains "<svg", so a regression that pushes all three
// views would slip through it. These pin the exact view set per example shape
// (AT-1628 AC-3: empty views are suppressed by auto-selection).
describe("empty-view suppression (view auto-selection)", () => {
  it("org-only renders only the org view", async () => {
    const rendered = await renderDiagram(entryOf("org-only", "en"));
    expect(rendered.views.map((v) => v.type)).toEqual(["org"]);
  });

  it("deploy-only renders only the deploy view", async () => {
    const rendered = await renderDiagram(entryOf("deploy-only", "en"));
    expect(rendered.views.map((v) => v.type)).toEqual(["deploy"]);
  });

  it("a system example includes system and omits empty views", async () => {
    // hr-tool has a system block and neither deploy nor organization.
    const rendered = await renderDiagram(entryOf("hr-tool", "en"));
    expect(rendered.views.map((v) => v.type)).toEqual(["system"]);
  });
});

// A localized() page must diverge per locale at the render level: the en entry
// draws English labels, the ja entry Japanese ones (AT-1642 AC-2). The on-site
// visual check stays manual; this fences the underlying render divergence.
describe("locale-distinct rendering", () => {
  it("localized example renders locale-distinct labels (en != ja)", async () => {
    const en = await renderDiagram(entryOf("payment-platform", "en"));
    const ja = await renderDiagram(entryOf("payment-platform", "ja"));
    expect(en.views[0].type).toBe("system");
    expect(ja.views[0].type).toBe("system");
    expect(en.views[0].svg).not.toBe(ja.views[0].svg);
    // Label-level signal, not merely a byte diff: the ja render carries
    // Japanese (kana / CJK) text and the en render does not.
    const japanese = /[぀-ヿ一-鿿]/; // hiragana / katakana / CJK
    expect(ja.views[0].svg).toMatch(japanese);
    expect(en.views[0].svg).not.toMatch(japanese);
  });
});
