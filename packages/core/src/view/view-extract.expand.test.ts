import { describe, it, expect } from "vitest";
import { extractView } from "./view-extract.js";
import { Parser } from "../parser/parser.js";
import type { KrsNode } from "../types/ast.js";

function parseSystem(krs: string): KrsNode[] {
  return Parser.parse(krs).value.systems;
}

// BillingService owns two domains with an internal edge (Invoicing -> Billing)
// and a cross-service edge (Billing -> Contract in ECommerce). ECommerce owns
// Contract. Inventory owns Stock, which points into BillingService (Stock ->
// Billing) — an incoming cross-boundary edge.
const KRS = `
system ECPlatform {
  service ECommerce {
    domain Contract { label "契約" }
  }
  service BillingService {
    domain Billing {
      Billing -> Contract "creates from contract"
    }
    domain Invoicing {
      Invoicing -> Billing "internal"
    }
  }
  service Inventory {
    domain Stock {
      Stock -> Billing "reserves"
    }
  }
}
`;

const ids = (nodes: KrsNode[]) => nodes.map((n) => n.id);

describe("extractView — in-place expansion (#1921)", () => {
  it("is a no-op without expandedContainers (baseline aggregation preserved)", () => {
    const view = extractView(parseSystem(KRS), []);
    expect(ids(view.childNodes)).toEqual(
      expect.arrayContaining(["ECommerce", "BillingService", "Inventory"]),
    );
    expect(ids(view.childNodes)).not.toContain("Billing");
    // Cross-service domain edge aggregates to the service pair.
    expect(view.childEdges.some((e) => e.from === "BillingService" && e.to === "ECommerce")).toBe(
      true,
    );
    expect(view.expandedFrames).toEqual([]);
  });

  it("replaces the expanded service with its domain children in childNodes", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    expect(ids(view.childNodes)).toContain("Billing");
    expect(ids(view.childNodes)).toContain("Invoicing");
    expect(ids(view.childNodes)).not.toContain("BillingService");
    // Siblings stay collapsed as service boxes.
    expect(ids(view.childNodes)).toContain("ECommerce");
    expect(ids(view.childNodes)).toContain("Inventory");
  });

  it("re-anchors the outgoing cross-boundary edge to the exact internal domain", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    // near endpoint = exact domain (Billing), far endpoint = collapsed sibling (ECommerce)
    const edge = view.childEdges.find((e) => e.from === "Billing" && e.to === "ECommerce");
    expect(edge).toBeDefined();
    expect(edge!.tags).toContain("implicit");
    // The aggregated service->service edge is gone (superseded by the domain-anchored one).
    expect(view.childEdges.some((e) => e.from === "BillingService" && e.to === "ECommerce")).toBe(
      false,
    );
  });

  it("re-anchors an incoming cross-boundary edge to the exact internal domain", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    // Inventory (collapsed) -> Billing (exact expanded domain)
    const edge = view.childEdges.find((e) => e.from === "Inventory" && e.to === "Billing");
    expect(edge).toBeDefined();
    expect(edge!.tags).toContain("implicit");
  });

  it("surfaces the expanded service's internal domain edges as real edges", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    const internal = view.childEdges.find((e) => e.from === "Invoicing" && e.to === "Billing");
    expect(internal).toBeDefined();
    expect(internal!.label).toBe("internal");
    expect(internal!.tags ?? []).not.toContain("implicit");
  });

  it("records the frame band for the expanded container", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    expect(view.expandedFrames).toHaveLength(1);
    const frame = view.expandedFrames[0];
    expect(frame.containerId).toBe("BillingService");
    expect(frame.memberIds).toEqual(expect.arrayContaining(["Billing", "Invoicing"]));
  });

  it("places every node exactly once (no duplication / no drop)", () => {
    const view = extractView(parseSystem(KRS), [], [], [], new Set(["BillingService"]));
    const idList = ids(view.childNodes);
    expect(new Set(idList).size).toBe(idList.length);
    // 2 collapsed services + 2 expanded domains = 4 nodes.
    expect(idList).toHaveLength(4);
  });

  it("keeps an explicit service edge suppressing the domain-derived edge under expansion", () => {
    // Regression for #1921 review finding 3: the explicit-edge suppression is
    // keyed on the *service* pair, so expanding an endpoint must not resurrect a
    // duplicate domain-anchored implicit edge for a pair the author drew explicitly.
    const KRS_EXPLICIT = `
system S {
  service A {
    domain Da {
      Da -> Db "domain edge"
    }
  }
  service B {
    domain Db { label "Db" }
  }
  A -> B "explicit"
}
`;
    const view = extractView(parseSystem(KRS_EXPLICIT), [], [], [], new Set(["A"]));
    // The explicit service edge survives (A expanded → anchors to its frame).
    expect(view.childEdges.some((e) => e.from === "A" && e.to === "B")).toBe(true);
    // No domain-anchored implicit duplicate (Da -> B) for the same pair.
    expect(view.childEdges.some((e) => e.from === "Da" && e.to === "B")).toBe(false);
  });

  it("ignores an unknown / childless expand id (frame only for real domains)", () => {
    const nope = extractView(parseSystem(KRS), [], [], [], new Set(["DoesNotExist"]));
    expect(nope.expandedFrames).toEqual([]);
    expect(ids(nope.childNodes)).toContain("BillingService");
    // ECommerce has a domain child (Contract), so it *can* expand.
    const ec = extractView(parseSystem(KRS), [], [], [], new Set(["ECommerce"]));
    expect(ec.expandedFrames).toHaveLength(1);
    expect(ec.expandedFrames[0].memberIds).toContain("Contract");
  });
});
