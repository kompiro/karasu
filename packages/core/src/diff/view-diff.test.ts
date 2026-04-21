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

  it("marks an annotation-only change as `unchanged` (badge diff) with delta", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(AFTER_ANNOTATION_CHANGED, ["Shop"]);
    const diff = diffSystemViewSlices(before, after);
    const meta = diff.nodes.get("Orders");
    // Body state is unchanged — annotation churn shouldn't paint the whole
    // node amber (see Issue #738 / design doc D-2).
    expect(meta?.state).toBe("unchanged");
    expect(meta?.changes?.annotations?.added).toContain("deprecated");
    expect(meta?.changes?.annotations?.removed).toEqual([]);
  });

  it("still marks label+annotation change as `changed`", () => {
    const before = viewOf(BEFORE, ["Shop"]);
    const after = viewOf(
      `
system Shop {
  service Catalog { label "商品カタログ" }
  service Orders @deprecated
  Catalog -> Orders "queries"
}
`,
      ["Shop"],
    );
    const diff = diffSystemViewSlices(before, after);
    expect(diff.nodes.get("Catalog")?.state).toBe("changed");
    expect(diff.nodes.get("Orders")?.state).toBe("unchanged");
  });

  describe("aggregated implicit edge constituent-set diff", () => {
    const BEFORE_AGG = `
system Shop {
  service Catalog {
    domain CatalogA { CatalogA -> OrdersA "reads" }
    domain CatalogB { CatalogB -> OrdersA "reads" }
  }
  service Orders {
    domain OrdersA
  }
}
`;
    const AFTER_AGG_ADDED = `
system Shop {
  service Catalog {
    domain CatalogA { CatalogA -> OrdersA "reads" }
    domain CatalogB { CatalogB -> OrdersA "reads" }
    domain CatalogC { CatalogC -> OrdersA "reads" }
  }
  service Orders {
    domain OrdersA
  }
}
`;
    const AFTER_AGG_SAME = BEFORE_AGG;

    it("marks aggregated implicit edge as unchanged when constituent set is identical", () => {
      const before = viewOf(BEFORE_AGG, []);
      const after = viewOf(AFTER_AGG_SAME, []);
      const diff = diffSystemViewSlices(before, after);
      const meta = diff.edges.get(edgeKey({ from: "Catalog", to: "Orders" }));
      expect(meta?.state).toBe("unchanged");
    });

    it("marks aggregated implicit edge as changed and records added constituents", () => {
      const before = viewOf(BEFORE_AGG, []);
      const after = viewOf(AFTER_AGG_ADDED, []);
      const diff = diffSystemViewSlices(before, after);
      const meta = diff.edges.get(edgeKey({ from: "Catalog", to: "Orders" }));
      expect(meta?.state).toBe("changed");
      expect(meta?.changes?.domainEdges?.added.map((d) => d.fromDomainId)).toEqual(["CatalogC"]);
      expect(meta?.changes?.domainEdges?.removed).toEqual([]);
    });

    it("annotates union implicitEdgeDetails with per-row diffState", () => {
      const before = viewOf(BEFORE_AGG, []);
      const after = viewOf(AFTER_AGG_ADDED, []);
      const diff = diffSystemViewSlices(before, after);
      const detailKey = [...diff.slice.implicitEdgeDetails.keys()].find((k) =>
        k.startsWith("Catalog->Orders"),
      );
      expect(detailKey).toBeDefined();
      const details = diff.slice.implicitEdgeDetails.get(detailKey!)!;
      const byFrom = Object.fromEntries(details.map((d) => [d.fromDomainId, d.diffState]));
      expect(byFrom.CatalogA).toBe("unchanged");
      expect(byFrom.CatalogB).toBe("unchanged");
      expect(byFrom.CatalogC).toBe("added");
    });

    it("captures removed constituents when the after side loses a domain edge", () => {
      const before = viewOf(AFTER_AGG_ADDED, []);
      const after = viewOf(BEFORE_AGG, []);
      const diff = diffSystemViewSlices(before, after);
      const meta = diff.edges.get(edgeKey({ from: "Catalog", to: "Orders" }));
      expect(meta?.state).toBe("changed");
      expect(meta?.changes?.domainEdges?.removed.map((d) => d.fromDomainId)).toEqual(["CatalogC"]);
    });
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
