import { describe, it, expect } from "vitest";
import { assembleMultiLevelSvg } from "./multi-level-svg.js";

const SIMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><defs><marker id="arrow-default"/></defs><rect width="800" height="600" fill="#0F172A"/><g class="nodes"><g data-node-id="A"/></g></svg>`;
const CHILD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><defs></defs><rect width="400" height="300" fill="#0F172A"/><g class="nodes"><g data-node-id="B"/></g></svg>`;

describe("assembleMultiLevelSvg", () => {
  it("returns the original SVG unchanged for a single level", () => {
    const result = assembleMultiLevelSvg([{ id: "root", svg: SIMPLE_SVG, parentId: null }]);
    expect(result).toBe(SIMPLE_SVG);
  });

  it("wraps levels in <g id='krs-view-*' class='krs-view'> elements", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "Service A" },
    ]);
    expect(result).toContain('id="krs-view-root"');
    expect(result).toContain('class="krs-view"');
    expect(result).toContain('id="krs-view-A"');
  });

  it("includes CSS :target + :has() navigation rules", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "Service A" },
    ]);
    expect(result).toContain(".krs-view { display: none; }");
    expect(result).toContain("svg:not(:has(.krs-view:target)) #krs-view-root { display: block; }");
    expect(result).toContain(".krs-view:target { display: block; }");
  });

  it("adds a back button linking to the parent in child levels", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "Service A" },
    ]);
    expect(result).toContain('href="#krs-view-root"');
    expect(result).toContain("← Service A");
  });

  it("uses the root SVG viewBox and dimensions for the output SVG", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "A" },
    ]);
    expect(result).toContain('viewBox="0 0 800 600"');
    expect(result).toContain('width="800"');
    expect(result).toContain('height="600"');
  });

  it("does not add a back button to the root level", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "A" },
    ]);
    // The back button link should only appear inside the child view group, not root
    const rootViewStart = result.indexOf('id="krs-view-root"');
    const childViewStart = result.indexOf('id="krs-view-A"');
    const backLinkPos = result.indexOf('href="#krs-view-root"');
    expect(backLinkPos).toBeGreaterThan(childViewStart);
    expect(backLinkPos).toBeGreaterThan(rootViewStart);
  });
});

  it("does not duplicate <defs> content in assembled output", () => {
    const result = assembleMultiLevelSvg([
      { id: "root", svg: SIMPLE_SVG, parentId: null },
      { id: "A", svg: CHILD_SVG, parentId: "root", label: "A" },
    ]);
    // marker id should appear only once (inside the outer <defs>, not again in view bodies)
    const occurrences = (result.match(/id="arrow-default"/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("handles self-closing <defs/> without extracting shared defs content", () => {
    const svgWithSelfClosingDefs = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><defs/><rect width="800" height="600" fill="#0F172A"/></svg>`;
    const child = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><defs/><rect width="400" height="300" fill="#0F172A"/></svg>`;
    // Should not throw and should produce valid output
    const result = assembleMultiLevelSvg([
      { id: "root", svg: svgWithSelfClosingDefs, parentId: null },
      { id: "A", svg: child, parentId: "root", label: "A" },
    ]);
    expect(result).toContain('id="krs-view-root"');
    expect(result).toContain('id="krs-view-A"');
  });
