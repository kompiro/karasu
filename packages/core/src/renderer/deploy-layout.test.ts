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

  it("containers do not overlap horizontally", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
      { serviceId: "Payment", serviceLabel: "決済サービス", unitIds: ["payment-svc"] },
    ]);
    const result = layoutDeploy(slice);

    const [c1, c2] = result.containers;
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

  it("has positive total dimensions", () => {
    const slice = makeSlice([
      { serviceId: "ECommerce", serviceLabel: "ECサイト", unitIds: ["order-api"] },
    ]);
    const result = layoutDeploy(slice);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
