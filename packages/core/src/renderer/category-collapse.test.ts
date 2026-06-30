import { describe, expect, it } from "vitest";
import type { KrsNode } from "../types/ast.js";
import { compile } from "../index.js";
import { CATEGORY_STUB_TAG, categoryOf, collapseNodeList, stubId } from "./category-collapse.js";

// categoryOf / collapseNodeList only read `kind` and `tags`.
function node(kind: string, tags: string[] = []): KrsNode {
  return { kind, tags } as unknown as KrsNode;
}

describe("categoryOf", () => {
  it("maps infra kinds to 'infra'", () => {
    expect(categoryOf(node("database"))).toBe("infra");
    expect(categoryOf(node("queue"))).toBe("infra");
    expect(categoryOf(node("storage"))).toBe("infra");
  });

  it("maps an [external] service to 'external'", () => {
    expect(categoryOf(node("service", ["external"]))).toBe("external");
  });

  it("returns null for a plain service", () => {
    expect(categoryOf(node("service"))).toBeNull();
  });
});

describe("collapseNodeList", () => {
  const nodes = [
    node("service"),
    node("service", ["external"]),
    node("service", ["external"]),
    node("database"),
  ];

  it("returns the same array when nothing is collapsed", () => {
    expect(collapseNodeList(nodes, undefined)).toBe(nodes);
    expect(collapseNodeList(nodes, new Set())).toBe(nodes);
  });

  it("replaces a collapsed category's nodes with one counted stub", () => {
    const out = collapseNodeList(nodes, new Set(["external"]));
    expect(
      out.filter((n) => n.tags.includes("external") && !n.tags.includes(CATEGORY_STUB_TAG)),
    ).toHaveLength(0);
    const stub = out.find((n) => n.id === stubId("external"));
    expect(stub?.tags).toContain(CATEGORY_STUB_TAG);
    expect(stub?.label).toBe("External (2)");
    // the plain service and the database are untouched
    expect(
      out.filter((n) => n.kind === "service" && !n.tags.includes(CATEGORY_STUB_TAG)),
    ).toHaveLength(1);
    expect(out.some((n) => n.id === stubId("infra"))).toBe(false);
  });

  it("collapses multiple categories independently", () => {
    const out = collapseNodeList(nodes, new Set(["external", "infra"]));
    expect(out.find((n) => n.id === stubId("external"))?.label).toBe("External (2)");
    expect(out.find((n) => n.id === stubId("infra"))?.label).toBe("Infra (1)");
    expect(out.some((n) => n.kind === "database" && !n.tags.includes(CATEGORY_STUB_TAG))).toBe(
      false,
    );
  });
});

// End-to-end: compile() threads collapsedCategories → render → layout.
const SYS = `
system Shop {
  service Web { label "Web" }
  service ExtApi [external] { label "Ext API" }
  database ShopDB {
    table Orders { label "Orders" }
  }
}
`;

function svgOf(collapsed?: Set<"external" | "infra">): string {
  const result = compile(SYS, { diagramType: "system", collapsedCategories: collapsed });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("compile() with collapsedCategories", () => {
  it("renders all categories by default", () => {
    const svg = svgOf();
    expect(svg).toContain('data-node-id="ShopDB"');
    expect(svg).toContain('data-node-id="ExtApi"');
    expect(svg).not.toContain("__collapsed_");
  });

  it("collapses infra to a stub, leaving external intact", () => {
    const svg = svgOf(new Set(["infra"]));
    expect(svg).not.toContain('data-node-id="ShopDB"');
    expect(svg).toContain('data-node-id="__collapsed_infra__"');
    expect(svg).toContain("Infra (1)");
    expect(svg).toContain('data-node-id="ExtApi"'); // independent
  });

  it("collapses external to a stub, leaving infra intact", () => {
    const svg = svgOf(new Set(["external"]));
    expect(svg).not.toContain('data-node-id="ExtApi"');
    expect(svg).toContain('data-node-id="__collapsed_external__"');
    expect(svg).toContain("External (1)");
    expect(svg).toContain('data-node-id="ShopDB"');
  });

  it("collapses both categories at once", () => {
    const svg = svgOf(new Set(["external", "infra"]));
    expect(svg).toContain('data-node-id="__collapsed_external__"');
    expect(svg).toContain('data-node-id="__collapsed_infra__"');
    expect(svg).not.toContain('data-node-id="ShopDB"');
    expect(svg).not.toContain('data-node-id="ExtApi"');
    expect(svg).toContain('data-node-id="Web"'); // the plain service survives
  });
});

describe("category controls rendering", () => {
  it("renders ⊖ controls + extent frames for open external/infra groups", () => {
    const svg = svgOf();
    expect(svg).toContain('data-category-group="infra"');
    expect(svg).toContain('data-category-group="external"');
    expect(svg).toContain('class="krs-cat-collapse"');
    expect(svg).toContain('class="krs-cat-frame"');
    expect(svg).toContain('data-collapse-category="infra"');
    expect(svg).toContain('data-collapse-category="external"');
    // the frame must never block node clicks
    expect(svg).toContain('pointer-events="none"');
  });

  it("renders the collapsed category as an expand stub, not an open group", () => {
    const svg = svgOf(new Set(["infra"]));
    expect(svg).toContain('class="krs-category-stub"');
    expect(svg).toContain('data-node-id="__collapsed_infra__"');
    expect(svg).toContain('data-collapse-category="infra"'); // on the stub, to expand
    expect(svg).not.toContain('data-category-group="infra"'); // no longer an open group
    expect(svg).toContain('data-category-group="external"'); // external still open
  });
});
