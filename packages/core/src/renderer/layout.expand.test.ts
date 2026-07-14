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

  it("routes a service-level edge between two expanded frames (frame endpoints, #1923)", () => {
    // The group router previously skipped edges whose endpoint is a frame (not a
    // node). Phase 2 resolves frame-anchored endpoints so a service→service edge
    // between two expanded containers connects to both frame borders.
    const KRS_TWO = `
system S {
  service A { label "A" domain Da { usecase U } }
  service B { label "B" domain Db { usecase V } }
  A -> B "calls"
}
`;
    const systems = Parser.parse(KRS_TWO).value.systems;
    const slice = extractView(systems, [], [], [], new Set(["A", "B"]));
    const result = layout(slice);
    const fa = result.containers.find((c) => c.nodeId === "A")!;
    const fb = result.containers.find((c) => c.nodeId === "B")!;
    expect(fa).toBeDefined();
    expect(fb).toBeDefined();
    const edge = result.edges.find((e) => e.from === "A" && e.to === "B");
    expect(edge).toBeDefined();
    const within = (v: number, lo: number, hi: number) => v >= lo - 1 && v <= hi + 1;
    // Endpoints anchor on their respective frame boxes (connected, not dropped).
    expect(within(edge!.fromPoint.x, fa.x, fa.x + fa.width)).toBe(true);
    expect(within(edge!.toPoint.x, fb.x, fb.x + fb.width)).toBe(true);
  });

  it("connects a cross-boundary edge to the exact interior domain (not gutter-routed away)", () => {
    // #1921 feedback: with the group edge-router, edges to a domain *inside* the
    // expanded frame were pushed to the side gutter and left disconnected. The
    // expansion path uses direct orthogonal routing so the edge terminates on
    // the target domain.
    const KRS_CROSS = `
system S {
  service A {
    label "A"
    domain Da { usecase U }
    domain Db2 { usecase V }
  }
  service B {
    domain Db {
      Db -> Da "calls"
    }
  }
}
`;
    const systems = Parser.parse(KRS_CROSS).value.systems;
    const slice = extractView(systems, [], [], [], new Set(["A"]));
    const result = layout(slice);
    const da = result.nodes.get("Da")!;
    expect(da).toBeDefined();
    // B (collapsed) -> Da (interior domain of expanded A)
    const edge = result.edges.find((e) => e.to === "Da");
    expect(edge).toBeDefined();
    // The edge's terminal point lands on the Da node box, not off in a gutter.
    expect(edge!.toPoint.x).toBeGreaterThanOrEqual(da.x - 1);
    expect(edge!.toPoint.x).toBeLessThanOrEqual(da.x + da.width + 1);
  });

  it("anchors a top-tier edge into the expanded frame on its top border, not its side", () => {
    // Regression for the frame-not-in-`layers` mis-route (#1921 review finding 1):
    // a user→expanded-service edge must run top-to-bottom, landing on the frame top.
    const KRS_USER = `
system S {
  user Actor [human] { label "Actor" }
  service Gateway {
    domain Authz { usecase Authorize }
    domain Refund { usecase DoRefund }
  }
  Actor -> Gateway "uses"
}
`;
    const systems = Parser.parse(KRS_USER).value.systems;
    const slice = extractView(systems, [], [], [], new Set(["Gateway"]));
    const result = layout(slice);
    const frame = result.containers.find((c) => c.expanded)!;
    const edge = result.edges.find((e) => e.from === "Actor" && e.to === "Gateway")!;
    expect(edge).toBeDefined();
    // The to-anchor lands on the frame's top edge, not a left/right side.
    expect(edge.toPoint.y).toBeCloseTo(frame.y, 0);
    expect(edge.toPoint.x).toBeGreaterThan(frame.x);
    expect(edge.toPoint.x).toBeLessThan(frame.x + frame.width);
  });
});
