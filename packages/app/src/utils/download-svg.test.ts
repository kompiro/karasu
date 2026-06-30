// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { stripInteractiveChrome } from "./download-svg.js";

describe("stripInteractiveChrome", () => {
  it("removes the krs-category-controls group (and its nested children)", () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="nodes"><g data-node-id="Web"></g></g>',
      '<g class="krs-category-controls">',
      "<style>.krs-cat-frame{opacity:0}</style>",
      '<g class="krs-cat-group" data-category-group="infra">',
      '<rect class="krs-cat-frame"></rect>',
      '<g class="krs-cat-collapse" data-collapse-category="infra"></g>',
      "</g></g>",
      "</svg>",
    ].join("");
    const out = stripInteractiveChrome(svg);
    expect(out).not.toContain("krs-category-controls");
    expect(out).not.toContain("krs-cat-collapse");
    expect(out).not.toContain("data-category-group");
    // node content survives
    expect(out).toContain('data-node-id="Web"');
  });

  it("keeps an already-collapsed ⊕ stub (it lives in the nodes group, not chrome)", () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="nodes"><g class="krs-category-stub" data-node-id="__collapsed_infra__"></g></g>',
      '<g class="krs-category-controls"><g class="krs-cat-collapse"></g></g>',
      "</svg>",
    ].join("");
    const out = stripInteractiveChrome(svg);
    expect(out).toContain('data-node-id="__collapsed_infra__"');
    expect(out).not.toContain("krs-cat-collapse");
  });

  it("returns the svg untouched when there is no controls group", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="nodes"></g></svg>';
    expect(stripInteractiveChrome(svg)).toBe(svg);
  });
});
