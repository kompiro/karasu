import { describe, it, expect } from "vitest";
import { extractDeployView } from "./deploy-view-extract.js";
import type { DeployBlock, SystemNode } from "../types/ast.js";

const LOC = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

function makeSystem(edges: { from: string; to: string; label?: string }[] = []): SystemNode {
  return {
    kind: "system",
    id: "EC",
    label: "EC",
    tags: [],
    annotations: [],
    properties: { links: [] },
    children: [
      {
        kind: "service",
        id: "ECommerce",
        label: "ECサイト",
        tags: [],
        annotations: [],
        properties: { links: [] },
        children: [],
        edges: [],
        loc: LOC,
      },
      {
        kind: "service",
        id: "Payment",
        label: "決済サービス",
        tags: [],
        annotations: [],
        properties: { links: [] },
        children: [],
        edges: [],
        loc: LOC,
      },
    ],
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
      kind: "sync" as const,
      tags: [],
      loc: LOC,
    })),
    loc: LOC,
  };
}

function makeDeployBlock(
  nodes: Array<{
    kind: "oci" | "jar" | "war" | "lambda" | "function" | "assets" | "job" | "artifact";
    id: string;
    realizes?: string;
    runtime?: string;
  }>,
): DeployBlock {
  return {
    label: "本番環境",
    nodes: nodes.map((n) => ({
      kind: n.kind,
      id: n.id,
      properties: { realizes: n.realizes, runtime: n.runtime },
      loc: LOC,
    })),
    loc: LOC,
  };
}

describe("extractDeployView", () => {
  it("returns empty slice when deploys is empty", () => {
    const result = extractDeployView([], []);
    expect(result.containers).toHaveLength(0);
    expect(result.unclassifiedUnits).toHaveLength(0);
    expect(result.ghostEdges).toHaveLength(0);
    expect(result.deployLabel).toBe("");
  });

  it("groups units by realizes service", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "oci", id: "order-worker", realizes: "ECommerce" },
      { kind: "oci", id: "payment-svc", realizes: "Payment" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers).toHaveLength(2);
    const ecommerce = result.containers.find((c) => c.serviceId === "ECommerce")!;
    expect(ecommerce).toBeDefined();
    expect(ecommerce.serviceLabel).toBe("ECサイト");
    expect(ecommerce.units).toHaveLength(2);

    const payment = result.containers.find((c) => c.serviceId === "Payment")!;
    expect(payment.units).toHaveLength(1);
  });

  it("collects units without realizes into unclassifiedUnits", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "job", id: "migration" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers).toHaveLength(1);
    expect(result.unclassifiedUnits).toHaveLength(1);
    expect(result.unclassifiedUnits[0].id).toBe("migration");
  });

  it("derives ghost edges from system edges between realized services", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "oci", id: "payment-svc", realizes: "Payment" },
    ]);
    const system = makeSystem([{ from: "ECommerce", to: "Payment", label: "決済する" }]);
    const result = extractDeployView([deploy], [system]);

    expect(result.ghostEdges).toHaveLength(1);
    expect(result.ghostEdges[0].from).toBe("ECommerce");
    expect(result.ghostEdges[0].to).toBe("Payment");
    expect(result.ghostEdges[0].label).toBe("決済する");
  });

  it("omits system edges where one side is not realized", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      // Payment is NOT in deploy
    ]);
    const system = makeSystem([{ from: "ECommerce", to: "Payment" }]);
    const result = extractDeployView([deploy], [system]);

    expect(result.ghostEdges).toHaveLength(0);
  });

  it("falls back to serviceId as label when service is not in system", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "unknown-svc", realizes: "UnknownService" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers[0].serviceLabel).toBe("UnknownService");
  });

  it("uses the deploy block label", () => {
    const deploy = makeDeployBlock([{ kind: "oci", id: "api", realizes: "ECommerce" }]);
    const result = extractDeployView([deploy], [makeSystem()]);
    expect(result.deployLabel).toBe("本番環境");
  });
});
