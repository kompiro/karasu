import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { diffDeployViewSlices } from "./deploy-view-diff.js";

function deployView(krs: string, blockId?: string) {
  const file = Parser.parse(krs).value;
  return extractDeployView(file.deploys, file.systems, blockId);
}

const BEFORE = `
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
}
`;

const AFTER_ADDED_UNIT = `
system Shop {
  service Catalog
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
  oci "payments-svc" { realizes Payments }
}
`;

const AFTER_REMOVED_UNIT = `
system Shop {
  service Catalog
  Catalog -> Catalog "self"
}
deploy Production {
  oci "catalog-svc" { realizes Catalog }
}
`;

const AFTER_ADDED_CONTAINER = `
system Shop {
  service Catalog
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
  oci "payments-api" { realizes Payments }
  oci "payments-worker" { realizes Payments }
}
`;

const AFTER_LABEL_CHANGED = `
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
deploy Production {
  oci "catalog-svc" {
    label "商品サービス"
    realizes Catalog
  }
  oci "orders-svc" { realizes Orders }
}
`;

describe("diffDeployViewSlices", () => {
  it("returns unchanged for identical inputs", () => {
    const a = deployView(BEFORE);
    const b = deployView(BEFORE);
    const diff = diffDeployViewSlices(a, b);
    for (const meta of diff.nodes.values()) expect(meta.state).toBe("unchanged");
    for (const meta of diff.edges.values()) expect(meta.state).toBe("unchanged");
  });

  it("marks an added container's units as added and the new ghost edge", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_ADDED_UNIT);
    const diff = diffDeployViewSlices(before, after);
    expect(diff.nodes.get("payments-svc")?.state).toBe("added");
    expect(diff.nodes.get("catalog-svc")?.state).toBe("unchanged");
    expect(diff.edges.get("Orders->Payments")?.state).toBe("added");
  });

  it("marks units in a removed container as removed and the removed ghost edge", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_REMOVED_UNIT);
    const diff = diffDeployViewSlices(before, after);
    expect(diff.nodes.get("orders-svc")?.state).toBe("removed");
    expect(diff.edges.get("Catalog->Orders")?.state).toBe("removed");
    // Union slice keeps the removed orders-svc unit in the merged container list.
    const allUnits = diff.slice.containers.flatMap((c) => c.units);
    expect(allUnits.find((u) => u.id === "orders-svc")).toBeDefined();
  });

  it("marks a label-only change as `changed` with before/after captured", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_LABEL_CHANGED);
    const diff = diffDeployViewSlices(before, after);
    const meta = diff.nodes.get("catalog-svc");
    expect(meta?.state).toBe("changed");
    expect(meta?.changes?.label?.after).toBe("商品サービス");
  });

  it("marks whole-container additions/removals on diff.containers", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_ADDED_CONTAINER);
    const diff = diffDeployViewSlices(before, after);
    expect(diff.containers.get("Payments")).toBe("added");
    expect(diff.containers.get("Catalog")).toBe("unchanged");
    expect(diff.containers.get("Orders")).toBe("unchanged");
  });

  it("marks a removed container on diff.containers", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_REMOVED_UNIT);
    const diff = diffDeployViewSlices(before, after);
    expect(diff.containers.get("Orders")).toBe("removed");
    expect(diff.containers.get("Catalog")).toBe("unchanged");
  });

  it("marks a container with differing units as changed", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_LABEL_CHANGED);
    const diff = diffDeployViewSlices(before, after);
    expect(diff.containers.get("Catalog")).toBe("changed");
    expect(diff.containers.get("Orders")).toBe("unchanged");
  });

  it("union slice contains the merged containers and units", () => {
    const before = deployView(BEFORE);
    const after = deployView(AFTER_ADDED_UNIT);
    const diff = diffDeployViewSlices(before, after);
    const ids = diff.slice.containers.flatMap((c) => c.units.map((u) => u.id));
    expect(ids).toContain("catalog-svc");
    expect(ids).toContain("orders-svc");
    expect(ids).toContain("payments-svc");
  });
});
