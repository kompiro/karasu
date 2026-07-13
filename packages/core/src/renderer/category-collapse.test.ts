import { describe, expect, it } from "vitest";
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { compile } from "../index.js";
import {
  CATEGORY_STUB_TAG,
  categoryOf,
  collapseCategories,
  collapseNodeList,
  stubId,
} from "./category-collapse.js";

// categoryOf / collapseNodeList only read `kind` and `tags`.
function node(kind: string, tags: string[] = []): KrsNode {
  return { kind, tags } as unknown as KrsNode;
}

// collapseCategories reads id / kind / tags on nodes and from / to / kind on edges.
function idNode(id: string, kind: string, tags: string[] = []): KrsNode {
  return { id, kind, tags } as unknown as KrsNode;
}
function edge(from: string, to: string, label?: string): KrsEdge {
  return { from, to, kind: "sync", label } as unknown as KrsEdge;
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

function svgOf(collapsed?: Set<"external" | "infra">, interactive = false): string {
  const result = compile(SYS, {
    diagramType: "system",
    collapsedCategories: collapsed,
    interactive,
  });
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

describe("collapseCategories edge re-targeting (#1872)", () => {
  const nodes = [
    idNode("Web", "service"),
    idNode("ExtA", "service", ["external"]),
    idNode("ExtB", "service", ["external"]),
    idNode("Db", "database"),
  ];

  it("is a no-op (same refs) when nothing collapses", () => {
    const edges = [edge("Web", "ExtA", "charge")];
    const r = collapseCategories(nodes, edges, new Set());
    expect(r.nodes).toBe(nodes);
    expect(r.edges).toBe(edges);
    expect(r.remapEndpoint("ExtA")).toBe("ExtA");
  });

  it("re-targets an edge from a surviving node onto the category stub", () => {
    const r = collapseCategories(nodes, [edge("Web", "ExtA", "charge")], new Set(["external"]));
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].from).toBe("Web");
    expect(r.edges[0].to).toBe(stubId("external"));
    // A re-targeted edge stands for one-or-more real edges → label dropped.
    expect(r.edges[0].label).toBeUndefined();
  });

  it("drops an edge that lives entirely inside one collapsed category", () => {
    const r = collapseCategories(nodes, [edge("ExtA", "ExtB")], new Set(["external"]));
    expect(r.edges).toHaveLength(0);
  });

  it("de-dupes parallel re-targeted edges but keeps distinct sources", () => {
    const r = collapseCategories(
      nodes,
      [edge("Web", "ExtA"), edge("Web", "ExtB"), edge("Db", "ExtA")],
      new Set(["external"]),
    );
    // Web→ExtA and Web→ExtB collapse to the same Web→extStub (deduped); Db→ExtA
    // is a distinct source, so it survives.
    expect(r.edges).toHaveLength(2);
    const pairs = r.edges.map((e) => `${e.from}->${e.to}`).sort();
    expect(pairs).toEqual([`Db->${stubId("external")}`, `Web->${stubId("external")}`]);
  });

  it("keeps a cross-category edge as a stub→stub trunk when both collapse", () => {
    const r = collapseCategories(nodes, [edge("ExtA", "Db")], new Set(["external", "infra"]));
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].from).toBe(stubId("external"));
    expect(r.edges[0].to).toBe(stubId("infra"));
  });

  it("passes through an edge between two surviving nodes untouched", () => {
    const survivor = idNode("Api", "service");
    const r = collapseCategories(
      [...nodes, survivor],
      [edge("Web", "Api", "call")],
      new Set(["external"]),
    );
    expect(r.edges).toEqual([edge("Web", "Api", "call")]);
  });
});

// End-to-end: a service→external edge survives as a trunk to the stub (#1872),
// where node-only folding used to drop it.
describe("compile(): edges to a collapsed category survive as trunks (#1872)", () => {
  const SRC_WITH_EDGE = `system Shop {
  service Web { label "Web" }
  service ExtApi [external] { label "Ext API" }
  Web -> ExtApi "charge"
}`;
  const arrows = (svg: string) => (svg.match(/marker-end/g) ?? []).length;

  it("re-targets the Web→ExtApi edge onto the external stub instead of dropping it", () => {
    const expanded = compile(SRC_WITH_EDGE, { diagramType: "system" });
    const collapsed = compile(SRC_WITH_EDGE, {
      diagramType: "system",
      collapsedCategories: new Set(["external"]),
    });
    if (expanded.diagramType !== "system" || collapsed.diagramType !== "system") {
      throw new Error("expected system view");
    }
    // The edge arrow survives the collapse (was 0 under the old drop behavior).
    expect(arrows(expanded.svg)).toBe(1);
    expect(arrows(collapsed.svg)).toBe(1);
    expect(collapsed.svg).toContain('data-node-id="__collapsed_external__"');
    expect(collapsed.svg).not.toContain('data-node-id="ExtApi"');
  });
});

describe("category controls rendering (interactive only)", () => {
  it("renders ⊖ controls + extent frames for open external/infra groups", () => {
    const svg = svgOf(undefined, true);
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
    const svg = svgOf(new Set(["infra"]), true);
    expect(svg).toContain('class="krs-category-stub"');
    expect(svg).toContain('data-node-id="__collapsed_infra__"');
    expect(svg).toContain('data-collapse-category="infra"'); // on the stub, to expand
    expect(svg).not.toContain('data-category-group="infra"'); // no longer an open group
    expect(svg).toContain('data-category-group="external"'); // external still open
  });

  it("omits the ⊖ controls + frames in a static (non-interactive) render", () => {
    const svg = svgOf(); // default: interactive omitted
    expect(svg).not.toContain("krs-category-controls");
    expect(svg).not.toContain("krs-cat-collapse");
    expect(svg).not.toContain("data-category-group");
    // but normal node content is unaffected
    expect(svg).toContain('data-node-id="ShopDB"');
    expect(svg).toContain('data-node-id="ExtApi"');
  });

  it("still draws the ⊕ stub of a collapsed category in a static render (content, not chrome)", () => {
    const svg = svgOf(new Set(["infra"])); // non-interactive
    expect(svg).toContain('data-node-id="__collapsed_infra__"');
    expect(svg).toContain("Infra (1)");
    expect(svg).not.toContain("krs-cat-collapse"); // no ⊖ control
  });
});
