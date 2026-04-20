import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { diffSystemViewSlices, edgeKey } from "./view-diff.js";

function viewOf(krs: string, viewPath: string[] = []) {
  const systems = Parser.parse(krs).value.systems;
  return extractView(systems, viewPath);
}

const BEFORE = `
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
`;

const AFTER_ADDED_SERVICE = `
system Shop {
  service Catalog
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
`;

const AFTER_REMOVED_SERVICE = `
system Shop {
  service Catalog
  Catalog -> Catalog "queries"
}
`;

const AFTER_LABEL_CHANGED = `
system Shop {
  service Catalog { label "商品カタログ" }
  service Orders
  Catalog -> Orders "queries"
}
`;

const AFTER_ANNOTATION_CHANGED = `
system Shop {
  service Catalog
  service Orders @deprecated
  Catalog -> Orders "queries"
}
`;

describe("diffSystemViewSlices", () => {
  it("returns unchanged for identical inputs", () => {
    const a = viewOf(BEFORE);
    const b = viewOf(BEFORE);
    const diff = diffSystemViewSlices(a, b);
    for (const meta of diff.nodes.values()) {
      expect(meta.state).toBe("unchanged");
    }
    for (const meta of diff.edges.values()) {
      expect(meta.state).toBe("unchanged");
    }
  });

  it("marks added service nodes and edges", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_ADDED_SERVICE, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    expect(diff.nodes.get("Payments")?.state).toBe("added");
    expect(diff.nodes.get("Catalog")?.state).toBe("unchanged");
    expect(diff.edges.get(edgeKey({ from: "Orders", to: "Payments" }))?.state).toBe("added");
  });

  it("marks removed service nodes and the original removed edge", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_REMOVED_SERVICE, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    expect(diff.nodes.get("Orders")?.state).toBe("removed");
    expect(diff.edges.get(edgeKey({ from: "Catalog", to: "Orders" }))?.state).toBe("removed");
    expect(diff.edges.get(edgeKey({ from: "Catalog", to: "Catalog" }))?.state).toBe("added");
    // Union slice retains the removed Orders node so the reader still sees it.
    expect(diff.slice.childNodes.find((n) => n.id === "Orders")).toBeDefined();
  });

  it("marks a label-only change as `changed` with before/after captured", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_LABEL_CHANGED, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    const meta = diff.nodes.get("Catalog");
    expect(meta?.state).toBe("changed");
    expect(meta?.changes?.label?.after).toBe("商品カタログ");
  });

  it("marks an annotation-only change as `changed` with delta", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_ANNOTATION_CHANGED, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    const meta = diff.nodes.get("Orders");
    expect(meta?.state).toBe("changed");
    expect(meta?.changes?.annotations?.added).toContain("deprecated");
    expect(meta?.changes?.annotations?.removed).toEqual([]);
  });

  it("union slice contains the merged node sets", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_ADDED_SERVICE, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    const ids = diff.slice.childNodes.map((n) => n.id);
    expect(ids).toContain("Catalog");
    expect(ids).toContain("Orders");
    expect(ids).toContain("Payments");
  });
});
