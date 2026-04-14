import { describe, it, expect } from "vitest";
import { buildInheritedAnnotations } from "./inherited-annotations.js";
import type { KrsNode } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";

const loc: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function node(overrides: Partial<KrsNode> & { kind: KrsNode["kind"]; id: string }): KrsNode {
  return {
    tags: [],
    annotations: [],
    children: [],
    edges: [],
    loc,
    properties: { links: [] },
    ...overrides,
  } as KrsNode;
}

describe("buildInheritedAnnotations", () => {
  it("returns an empty map when no service carries annotations", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Svc",
          children: [node({ kind: "domain", id: "D" })],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.size).toBe(0);
  });

  it("propagates service annotations to a child domain", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [node({ kind: "domain", id: "Order" })],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.get("Order")).toEqual(["deprecated"]);
  });

  it("does not record an entry for a child with its own annotations", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [node({ kind: "domain", id: "Order", annotations: ["migration_target"] })],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.has("Order")).toBe(false);
  });

  it("propagates transitively through multiple levels", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [
            node({
              kind: "domain",
              id: "Order",
              children: [
                node({
                  kind: "usecase",
                  id: "PlaceOrder",
                  children: [node({ kind: "resource", id: "OrdersTable" })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.get("Order")).toEqual(["deprecated"]);
    expect(map.get("PlaceOrder")).toEqual(["deprecated"]);
    expect(map.get("OrdersTable")).toEqual(["deprecated"]);
  });

  it("stops propagation when a descendant carries its own annotations", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Svc",
          annotations: ["deprecated"],
          children: [
            node({
              kind: "domain",
              id: "D",
              annotations: ["experimental"],
              children: [node({ kind: "usecase", id: "U" })],
            }),
          ],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.has("D")).toBe(false);
    expect(map.get("U")).toEqual(["experimental"]);
  });

  it("keeps siblings independent", () => {
    const system = node({
      kind: "system",
      id: "S",
      children: [
        node({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [node({ kind: "domain", id: "Order" })],
        }),
        node({
          kind: "service",
          id: "NewSvc",
          annotations: ["migration_target"],
          children: [node({ kind: "domain", id: "OrderNew" })],
        }),
        node({
          kind: "service",
          id: "Plain",
          children: [node({ kind: "domain", id: "Payment" })],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.get("Order")).toEqual(["deprecated"]);
    expect(map.get("OrderNew")).toEqual(["migration_target"]);
    expect(map.has("Payment")).toBe(false);
  });

  it("propagates from a service passed in directly as a root (focused container)", () => {
    // Layout's drill-down view passes `[viewSlice.containerNode]` — when the
    // user has drilled into a service, the service itself is the root and
    // its annotations must propagate to its descendants.
    const service = node({
      kind: "service",
      id: "Legacy",
      annotations: ["deprecated"],
      children: [
        node({
          kind: "domain",
          id: "Order",
          children: [node({ kind: "usecase", id: "PlaceOrder" })],
        }),
        node({ kind: "domain", id: "Catalog", annotations: ["experimental"] }),
      ],
    });
    const map = buildInheritedAnnotations([service]);
    expect(map.get("Order")).toEqual(["deprecated"]);
    expect(map.get("PlaceOrder")).toEqual(["deprecated"]);
    expect(map.has("Catalog")).toBe(false);
  });

  it("does not propagate system-level annotations to services", () => {
    const system = node({
      kind: "system",
      id: "S",
      annotations: ["deprecated"],
      children: [
        node({
          kind: "service",
          id: "Svc",
          children: [node({ kind: "domain", id: "D" })],
        }),
      ],
    });
    const map = buildInheritedAnnotations([system]);
    expect(map.has("Svc")).toBe(false);
    expect(map.has("D")).toBe(false);
  });
});
