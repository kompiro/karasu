import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";

const KRS = `
system ECPlatform {
  service ECommerce {
    domain Contract { label "契約" }
  }
  service BillingService {
    label "Billing"
    domain Billing {
      Billing -> Contract "creates from contract"
    }
    domain Invoicing {
      Invoicing -> Billing "internal"
    }
  }
}
`;

function sliceWith(expanded?: string[]) {
  const systems = Parser.parse(KRS).value.systems;
  return extractView(systems, [], [], [], expanded ? new Set(expanded) : undefined);
}

describe("layout — in-place expansion band + frame (#1921)", () => {
  it("draws no expanded frame in the baseline", () => {
    const result = layout(sliceWith());
    expect(result.containers.some((c) => c.expanded)).toBe(false);
  });

  it("frames the expanded container with its label and node id", () => {
    const result = layout(sliceWith(["BillingService"]));
    const frame = result.containers.find((c) => c.expanded);
    expect(frame).toBeDefined();
    expect(frame!.nodeId).toBe("BillingService");
    expect(frame!.label).toBe("Billing"); // service label, not the raw id
    expect(frame!.group).toBe(true);
  });

  it("places the expanded domains inside the frame bounds", () => {
    const result = layout(sliceWith(["BillingService"]));
    const frame = result.containers.find((c) => c.expanded)!;
    for (const id of ["Billing", "Invoicing"]) {
      const node = result.nodes.get(id);
      expect(node).toBeDefined();
      expect(node!.x).toBeGreaterThanOrEqual(frame.x);
      expect(node!.y).toBeGreaterThanOrEqual(frame.y);
      expect(node!.x + node!.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(node!.y + node!.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it("keeps the collapsed sibling outside the frame", () => {
    const result = layout(sliceWith(["BillingService"]));
    const frame = result.containers.find((c) => c.expanded)!;
    const sibling = result.nodes.get("ECommerce");
    expect(sibling).toBeDefined();
    // ECommerce is not a member of the frame band.
    const insideY = sibling!.y >= frame.y && sibling!.y + sibling!.height <= frame.y + frame.height;
    const insideX = sibling!.x >= frame.x && sibling!.x + sibling!.width <= frame.x + frame.width;
    expect(insideX && insideY).toBe(false);
  });

  it("preserves every re-anchored edge endpoint (no drop)", () => {
    const result = layout(sliceWith(["BillingService"]));
    const edgeIds = result.edges.map((e) => `${e.from}->${e.to}`);
    // cross-boundary (domain→sibling service) and internal (domain→domain) both drawn
    expect(edgeIds).toContain("Billing->ECommerce");
    expect(edgeIds).toContain("Invoicing->Billing");
  });

  it("anchors an explicit service-level edge on the expanded frame instead of dropping it", () => {
    // Gateway (explicit edges, no cross-service domain edges) → expanding it must
    // not drop its authored service-level connectivity (#1921).
    const KRS_EXPLICIT = `
system S {
  service Gateway {
    domain Authz { usecase Authorize }
    domain Refund { usecase DoRefund }
  }
  service Risk { description "risk" }
  Gateway -> Risk "score"
}
`;
    const systems = Parser.parse(KRS_EXPLICIT).value.systems;
    const slice = extractView(systems, [], [], [], new Set(["Gateway"]));
    const result = layout(slice);
    const frame = result.containers.find((c) => c.expanded)!;
    expect(frame.nodeId).toBe("Gateway");
    // The explicit Gateway -> Risk edge survives (anchored to the frame border).
    const edge = result.edges.find((e) => e.from === "Gateway" && e.to === "Risk");
    expect(edge).toBeDefined();
    // Its from-anchor sits on the expanded frame's box.
    expect(edge!.fromPoint.x).toBeGreaterThanOrEqual(frame.x);
    expect(edge!.fromPoint.x).toBeLessThanOrEqual(frame.x + frame.width);
  });
});
