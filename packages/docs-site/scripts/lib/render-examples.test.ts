import { describe, expect, it } from "vitest";
import { GALLERY_PAGES, resolveEntry } from "./examples-manifest.ts";
import { renderDiagram } from "./render-examples.ts";
import type { Locale } from "./site-map.ts";

function entryOf(slug: string, locale: Locale): string {
  const page = GALLERY_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`fixture missing: ${slug}`);
  return resolveEntry(page.diagrams[0].entry, locale);
}

// PR-time guard (docs-site build runs only in pages.yml): every example in the
// manifest — for both locales, with its render options — must compile and
// yield at least one non-empty view, so a broken or renamed example fails the
// build before it ships.
describe("examples gallery rendering", () => {
  const cases = [
    ...new Map(
      GALLERY_PAGES.flatMap((p) =>
        p.diagrams.flatMap((d) =>
          (["en", "ja"] as const).map((locale) => {
            const entry = resolveEntry(d.entry, locale);
            const render = d.render ?? {};
            const key = `${entry} ${JSON.stringify(render)}`;
            return [key, { key, entry, render }] as const;
          }),
        ),
      ),
    ).values(),
  ];

  it.each(cases)("renders $key to at least one non-empty view", async ({ entry, render }) => {
    const rendered = await renderDiagram(entry, render);
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

// boundary frames draw only under Group by: Boundary, and the facet ring only
// under a facet selection, so a diagram whose `render` options were dropped on
// the way to compileProject would still pass the smoke test above while the
// page silently shows the plain view (#2937). These pin that each option takes
// effect, driven from the manifest so a typo'd facet id fails too.
describe("per-diagram render options", () => {
  const withRender = GALLERY_PAGES.flatMap((p) =>
    p.diagrams
      .filter((d) => d.render)
      .map((d) => ({ entry: resolveEntry(d.entry, "en"), render: d.render ?? {} })),
  );

  it("the manifest sets both kinds of option somewhere", () => {
    expect(withRender.some((d) => d.render.groupBy === "boundary")).toBe(true);
    expect(withRender.some((d) => (d.render.selectedFacets ?? []).length > 0)).toBe(true);
  });

  it.each(withRender.filter((d) => d.render.groupBy === "boundary"))(
    "$entry draws boundary frames only with groupBy: boundary",
    async ({ entry, render }) => {
      const frame = 'data-container-id="__group_';
      const grouped = await renderDiagram(entry, render);
      expect(grouped.views[0].type).toBe("system");
      expect(grouped.views[0].svg).toContain(frame);
      const plain = await renderDiagram(entry);
      expect(plain.views[0].svg).not.toContain(frame);
    },
  );

  it.each(withRender.filter((d) => (d.render.selectedFacets ?? []).length > 0))(
    "$entry rings every selected facet",
    async ({ entry, render }) => {
      const rendered = await renderDiagram(entry, render);
      expect(rendered.views[0].type).toBe("system");
      for (const facet of render.selectedFacets ?? []) {
        expect(rendered.views[0].svg).toContain(`data-facet-ring="${facet}"`);
      }
      const plain = await renderDiagram(entry);
      expect(plain.views[0].svg).not.toContain("data-facet-ring");
    },
  );
});
