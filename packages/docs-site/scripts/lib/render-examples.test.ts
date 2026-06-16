import { describe, expect, it } from "vitest";
import { GALLERY_PAGES } from "./examples-manifest.ts";
import { renderDiagram } from "./render-examples.ts";

// PR-time guard (docs-site build runs only in pages.yml): every example in the
// manifest must compile and yield at least one non-empty view, so a broken or
// renamed example fails the build before it ships.
describe("examples gallery rendering", () => {
  const entries = GALLERY_PAGES.flatMap((p) => p.diagrams.map((d) => d.entry));

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
