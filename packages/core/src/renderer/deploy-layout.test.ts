import { describe, it, expect } from "vitest";
import { layoutDeploy } from "./deploy-layout.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";

const LOC = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

function makeSlice(
  containers: Array<{
    serviceId: string;
    serviceLabel: string;
    unitIds: string[];
  }>,
  unclassifiedIds: string[] = [],
  ghostEdges: Array<{ from: string; to: string }> = [],
): DeployViewSlice {
  return {
    deployLabel: "本番環境",
    containers: containers.map((c) => ({
      serviceId: c.serviceId,
      serviceLabel: c.serviceLabel,
      units: c.unitIds.map((id) => ({
        kind: "oci" as const,
        id,
        properties: { runtime: "Node.js 20" },
        loc: LOC,
      })),
    })),
    unclassifiedUnits: unclassifiedIds.map((id) => ({
      kind: "job" as const,
      id,
      properties: {},
      loc: LOC,
    })),
    ghostEdges: ghostEdges.map((e) => ({ ...e, kind: "sync" as const })),
  };
}

describe("layoutDeploy", () => {
  it("returns empty result for empty slice", () => {
    const result = layoutDeploy({
      deployLabel: "",
      containers: [],
      unclassifiedUnits: [],
      ghostEdges: [],
    });
    expect(result.nodes.size).toBe(0);
    expect(result.containers).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("creates a container for each service group", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
      { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
    ]);
    const result = layoutDeploy(slice);

    expect(result.containers).toHaveLength(2);
    expect(result.containers[0].id).toBe("ECommerce");
    expect(result.containers[0].label).toBe("ECサイト");
    expect(result.containers[1].id).toBe("Payment");
  });

  it("places units as layout nodes inside containers", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api", "order-worker"] },
    ]);
    const result = layoutDeploy(slice);

    expect(result.nodes.size).toBe(2);
    expect(result.nodes.has("order-api")).toBe(true);
    expect(result.nodes.has("order-worker")).toBe(true);
  });

  it("places unclassified units in an __unclassified__ container", () => {
    const slice = makeSlice(
      [{ serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] }],
      ["migration"],
    );
    const result = layoutDeploy(slice);

    expect(result.containers).toHaveLength(2);
    const unclassified = result.containers.find((c) => c.id === "__unclassified__");
    expect(unclassified).toBeDefined();
    expect(result.nodes.has("migration")).toBe(true);
  });

  it("does not create __unclassified__ container when all units have realizes", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);

    const unclassified = result.containers.find((c) => c.id === "__unclassified__");
    expect(unclassified).toBeUndefined();
  });

  it("containers do not overlap horizontally when in the same layer", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
      { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
    ]);
    const result = layoutDeploy(slice);

    // No edges → both containers at layer 0, placed side by side
    const [c1, c2] = result.containers;
    expect(c1.y).toBe(c2.y);
    expect(c2.x).toBeGreaterThan(c1.x + c1.width);
  });

  it("nodes are positioned inside their container", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);

    const container = result.containers[0];
    const node = result.nodes.get("order-api")!;

    expect(node.x).toBeGreaterThanOrEqual(container.x);
    expect(node.y).toBeGreaterThanOrEqual(container.y);
    expect(node.x + node.width).toBeLessThanOrEqual(container.x + container.width);
    expect(node.y + node.height).toBeLessThanOrEqual(container.y + container.height);
  });

  it("produces ghost edges between service containers", () => {
    const slice = makeSlice(
      [
        { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
        { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
      ],
      [],
      [{ from: "ECommerce", to: "Payment" }],
    );
    const result = layoutDeploy(slice);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].ghost).toBe(true);
    expect(result.edges[0].from).toBe("ECommerce");
    expect(result.edges[0].to).toBe("Payment");
  });

  it("skips ghost edges for unknown container ids", () => {
    const slice = makeSlice(
      [{ serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] }],
      [],
      [{ from: "ECommerce", to: "UnknownService" }],
    );
    const result = layoutDeploy(slice);
    expect(result.edges).toHaveLength(0);
  });

  it("sets runtime as description on layout nodes", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);
    const node = result.nodes.get("order-api")!;
    expect(node.properties.description).toBe("Node.js 20");
    expect(node.hasDescription).toBe(true);
  });

  it("uses unit label as display text when set", () => {
    const slice: DeployViewSlice = {
      deployLabel: "本番環境",
      containers: [
        {
          serviceId: "ECommerce",
          serviceLabel: "ECサイト",
          units: [
            {
              kind: "oci" as const,
              id: "ecommerceApp",
              label: "EC Application",
              properties: { runtime: "Node.js 20" },
              loc: LOC,
            },
          ],
        },
      ],
      unclassifiedUnits: [],
      ghostEdges: [],
    };
    const result = layoutDeploy(slice);
    const node = result.nodes.get("ecommerceApp")!;
    expect(node.label).toBe("EC Application");
  });

  it("falls back to unit id as display text when label is absent", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);
    const node = result.nodes.get("order-api")!;
    expect(node.label).toBe("order-api");
  });

  it("has positive total dimensions", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("places downstream container in a lower layer than upstream when connected by a ghost edge", () => {
    const slice = makeSlice(
      [
        { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
        { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
      ],
      [],
      [{ from: "ECommerce", to: "Payment" }],
    );
    const result = layoutDeploy(slice);

    const ecommerce = result.containers.find((c) => c.id === "ECommerce")!;
    const payment = result.containers.find((c) => c.id === "Payment")!;

    // Payment is downstream → should be below ECommerce
    expect(payment.y).toBeGreaterThan(ecommerce.y);
  });

  it("places multi-hop chain in correct layer order", () => {
    const slice = makeSlice(
      [
        { serviceId: "A", serviceLabel: "A", unitIds: ["a"] },
        { serviceId: "B", serviceLabel: "B", unitIds: ["b"] },
        { serviceId: "C", serviceLabel: "C", unitIds: ["c"] },
      ],
      [],
      [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
    );
    const result = layoutDeploy(slice);

    const cA = result.containers.find((c) => c.id === "A")!;
    const cB = result.containers.find((c) => c.id === "B")!;
    const cC = result.containers.find((c) => c.id === "C")!;

    expect(cB.y).toBeGreaterThan(cA.y);
    expect(cC.y).toBeGreaterThan(cB.y);
  });

  it("ghost edge fromPoint originates from bottom of from-container when from is above to", () => {
    const slice = makeSlice(
      [
        { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
        { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
      ],
      [],
      [{ from: "ECommerce", to: "Payment" }],
    );
    const result = layoutDeploy(slice);

    const edge = result.edges[0];
    const ecommerce = result.containers.find((c) => c.id === "ECommerce")!;
    const payment = result.containers.find((c) => c.id === "Payment")!;

    expect(edge.fromPoint.y).toBe(ecommerce.y + ecommerce.height);
    expect(edge.toPoint.y).toBe(payment.y);
  });

  it("handles cycles in ghost edges without infinite loop", () => {
    const slice = makeSlice(
      [
        { serviceId: "A", serviceLabel: "A", unitIds: ["a"] },
        { serviceId: "B", serviceLabel: "B", unitIds: ["b"] },
      ],
      [],
      [
        { from: "A", to: "B" },
        { from: "B", to: "A" }, // cycle
      ],
    );
    // Should complete without hanging and return valid layout
    const result = layoutDeploy(slice);
    expect(result.containers).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
  });

  it("places unclassified container below all classified containers", () => {
    const slice = makeSlice(
      [{ serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] }],
      ["migration"],
    );
    const result = layoutDeploy(slice);

    const classified = result.containers.find((c) => c.id === "ECommerce")!;
    const unclassified = result.containers.find((c) => c.id === "__unclassified__")!;

    expect(unclassified.y).toBeGreaterThan(classified.y + classified.height);
  });
});
