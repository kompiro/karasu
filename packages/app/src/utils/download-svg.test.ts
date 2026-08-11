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

  it("removes the per-node i / D buttons but keeps the card and its chip (#2420)", () => {
    // The live SVG draws these; a fresh static render never does, so an export
    // that kept them would not match `karasu render` output (TPL-1001).
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="nodes"><g data-node-id="Web">',
      '<g data-node-badge="Web"><rect></rect><text>NEW</text></g>',
      '<g data-info-button="Web" class="krs-node-controls"><text>i</text></g>',
      '<g data-deploy-button="Web" class="krs-node-controls"><text>D</text></g>',
      "</g></g>",
      "</svg>",
    ].join("");
    const out = stripInteractiveChrome(svg);
    expect(out).not.toContain("data-info-button");
    expect(out).not.toContain("data-deploy-button");
    // The annotation chip is content, not chrome — it survives.
    expect(out).toContain('data-node-badge="Web"');
    expect(out).toContain("NEW");
    expect(out).toContain('data-node-id="Web"');
  });

  it("returns the svg untouched when there is no interactive chrome", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="nodes"></g></svg>';
    expect(stripInteractiveChrome(svg)).toBe(svg);
  });
});
