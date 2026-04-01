import { describe, it, expect } from "vitest";
import { buildLevelId, collectAllSystemPaths, assembleMultiLevelSvg } from "./multi-level-svg.js";
import type { ExportLevel } from "./multi-level-svg.js";
import type { KrsNode } from "../types/ast.js";

// Minimal KrsNode factory for testing collectAllSystemPaths
function makeNode(id: string, children: KrsNode[] = []): KrsNode {
  return {
    id,
    label: id,
    kind: "service",
    tags: [],
    annotations: [],
    children,
    edges: [],
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } },
    properties: { links: [] },
  } as unknown as KrsNode;
}

describe("buildLevelId", () => {
  it("returns 'krs-view-root' for empty path", () => {
    expect(buildLevelId([])).toBe("krs-view-root");
  });

  it("returns 'krs-view-root__A' for path ['A']", () => {
    expect(buildLevelId(["A"])).toBe("krs-view-root__A");
  });

  it("returns 'krs-view-root__A__B' for path ['A', 'B']", () => {
    expect(buildLevelId(["A", "B"])).toBe("krs-view-root__A__B");
  });

  it("handles IDs with hyphens — preserves full ID without ambiguity", () => {
    // Using __ as separator means hyphenated IDs like "my-service" are unambiguous
    const id = buildLevelId(["my-service", "sub-node"]);
    expect(id).toBe("krs-view-root__my-service__sub-node");
    // The level for ["my"] would be different: "krs-view-root__my"
    expect(buildLevelId(["my"])).not.toBe(id);
  });
});

describe("collectAllSystemPaths", () => {
  it("returns only [[]] when system has no children with grandchildren", () => {
    const leaf = makeNode("Leaf");
    const system = makeNode("Root", [leaf]);
    const paths = collectAllSystemPaths([system], 4);
    // Root level is always included; Leaf has no children so no child path
    expect(paths).toEqual([[]]);
  });

  it("includes child path when a child has children", () => {
    const grandchild = makeNode("GC");
    const child = makeNode("Child", [grandchild]);
    const system = makeNode("Root", [child]);
    const paths = collectAllSystemPaths([system], 4);
    expect(paths).toContainEqual([]);
    expect(paths).toContainEqual(["Child"]);
  });

  it("collects multiple levels of nesting", () => {
    const ggc = makeNode("GGC");
    const gc = makeNode("GC", [ggc]);
    const child = makeNode("Child", [gc]);
    const system = makeNode("Root", [child]);
    const paths = collectAllSystemPaths([system], 4);
    expect(paths).toContainEqual([]);
    expect(paths).toContainEqual(["Child"]);
    expect(paths).toContainEqual(["Child", "GC"]);
  });

  it("respects maxDepth limit", () => {
    const ggc = makeNode("GGC");
    const gc = makeNode("GC", [ggc]);
    const child = makeNode("Child", [gc]);
    const system = makeNode("Root", [child]);
    // maxDepth=1: only root [] and ["Child"] paths (not ["Child","GC"])
    const paths = collectAllSystemPaths([system], 1);
    expect(paths).toContainEqual([]);
    expect(paths).not.toContainEqual(["Child", "GC"]);
  });

  it("handles multiple systems", () => {
    const gc1 = makeNode("GC1");
    const child1 = makeNode("Child1", [gc1]);
    const sys1 = makeNode("Sys1", [child1]);

    const gc2 = makeNode("GC2");
    const child2 = makeNode("Child2", [gc2]);
    const sys2 = makeNode("Sys2", [child2]);

    const paths = collectAllSystemPaths([sys1, sys2], 4);
    expect(paths).toContainEqual(["Child1"]);
    expect(paths).toContainEqual(["Child2"]);
  });
});

describe("assembleMultiLevelSvg", () => {
  const makeLevel = (id: string, breadcrumb: { id: string; label: string }[]): ExportLevel => ({
    id,
    width: 800,
    height: 600,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600"/></svg>`,
    breadcrumb,
  });

  it("returns a placeholder SVG for empty levels array", () => {
    const svg = assembleMultiLevelSvg([]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("No levels to display");
  });

  it("produces SVG with .krs-level class on each level group", () => {
    const level = makeLevel("krs-view-root", [{ id: "krs-view-root", label: "Root" }]);
    const svg = assembleMultiLevelSvg([level]);
    expect(svg).toContain('class="krs-level"');
    expect(svg).toContain('id="krs-view-root"');
  });

  it("stacks all levels vertically — no display:none hiding", () => {
    const level = makeLevel("krs-view-root", [{ id: "krs-view-root", label: "Root" }]);
    const svg = assembleMultiLevelSvg([level]);
    // All levels are always visible (stacked vertically); no hide/show CSS needed.
    expect(svg).not.toContain("display: none");
    expect(svg).not.toContain(":has(");
    expect(svg).toContain("cursor: pointer");
  });

  it("positions each level with a vertical translate transform", () => {
    const root = makeLevel("krs-view-root", [{ id: "krs-view-root", label: "Root" }]);
    const child = makeLevel("krs-view-root__Child", [
      { id: "krs-view-root", label: "Root" },
      { id: "krs-view-root__Child", label: "Child" },
    ]);
    const svg = assembleMultiLevelSvg([root, child]);
    // Root level starts at y=0
    expect(svg).toContain("translate(0, 0)");
    // Child level starts below root (BREADCRUMB_HEIGHT=40 + height=600 = 640)
    expect(svg).toContain("translate(0, 640)");
  });

  it("includes breadcrumb link back to parent for child levels", () => {
    const root = makeLevel("krs-view-root", [{ id: "krs-view-root", label: "Root" }]);
    const child = makeLevel("krs-view-root__Child", [
      { id: "krs-view-root", label: "Root" },
      { id: "krs-view-root__Child", label: "Child" },
    ]);
    const svg = assembleMultiLevelSvg([root, child]);
    // The child level's breadcrumb should link back to root
    expect(svg).toContain('href="#krs-view-root"');
    expect(svg).toContain('id="krs-view-root__Child"');
  });

  it("uses viewBox dimensions based on max width/height across levels", () => {
    const small = makeLevel("krs-view-root", [{ id: "krs-view-root", label: "Root" }]);
    const large: ExportLevel = {
      id: "krs-view-root__Big",
      width: 1200,
      height: 900,
      svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"></svg>`,
      breadcrumb: [
        { id: "krs-view-root", label: "Root" },
        { id: "krs-view-root__Big", label: "Big" },
      ],
    };
    const svg = assembleMultiLevelSvg([small, large]);
    expect(svg).toContain("1200");
  });
});
