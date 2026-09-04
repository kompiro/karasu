import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { countPolylinePenetrations } from "./edge-geometry.js";

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
  it("marks every expanded frame as a group frame (#2608 bounds channels with those)", () => {
    // The lane pass takes the group frames as channel obstacles; an expanded
    // container's frame is one of them, so a lane never lands in its padding.
    const result = layout(sliceWith(["BillingService"]));
    const expanded = result.containers.filter((c) => c.expanded);
    expect(expanded.length).toBeGreaterThan(0);
    expect(expanded.every((c) => c.group)).toBe(true);
  });

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

  it("routes an edge around a non-endpoint expanded frame (no penetration, #1923)", () => {
    // A → C with B stacked between them, all three expanded. The A→C edge must
    // detour around B's frame via the gutter, never crossing its interior.
    const KRS_THREE = `
system S {
  service A { label "A" domain Da { usecase U } }
  service B { label "B" domain Db { usecase V } }
  service C { label "C" domain Dc { usecase W } }
  A -> C "x"
}
`;
    const systems = Parser.parse(KRS_THREE).value.systems;
    const slice = extractView(systems, [], [], [], new Set(["A", "B", "C"]));
    const result = layout(slice);
    const frameB = result.containers.find((c) => c.nodeId === "B")!;
    expect(frameB).toBeDefined();
    const edge = result.edges.find((e) => e.from === "A" && e.to === "C")!;
    expect(edge).toBeDefined();
    // Full rendered polyline (endpoints + waypoints) must not pierce B's frame.
    const poly = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    expect(countPolylinePenetrations(poly, [frameB])).toBe(0);
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

  it("keeps parallel edges between two expanded frames apart (#2477)", () => {
    // `distributePorts` skips both edges (neither endpoint is a layout node once
    // the services are frames), so separating them falls to `markParallelBundles`.
    const KRS_PARALLEL = `
system T {
  service S1 { domain A { usecase u {} } }
  service S2 { domain B { usecase v {} } }
  S1 -> S2
  S1 --> S2
}
`;
    const systems = Parser.parse(KRS_PARALLEL).value.systems;
    const result = layout(extractView(systems, [], [], [], new Set(["S1", "S2"])));
    const bundle = result.edges.filter((e) => e.from === "S1" && e.to === "S2");
    expect(bundle).toHaveLength(2);
    const [sync, async] = bundle;
    expect(sync.fromPoint.x).not.toBeCloseTo(async.fromPoint.x);
    expect(sync.toPoint.x).not.toBeCloseTo(async.toPoint.x);
    expect(sync.bundleSize).toBe(2);
    // Both still leave S1's frame at its bottom border and land on S2's top.
    const source = result.containers.find((c) => c.nodeId === "S1")!;
    const target = result.containers.find((c) => c.nodeId === "S2")!;
    for (const edge of bundle) {
      expect(edge.fromPoint.y).toBeCloseTo(source.y + source.height);
      expect(edge.fromPoint.x).toBeGreaterThan(source.x);
      expect(edge.fromPoint.x).toBeLessThan(source.x + source.width);
      expect(edge.toPoint.y).toBeCloseTo(target.y);
      expect(edge.toPoint.x).toBeGreaterThan(target.x);
      expect(edge.toPoint.x).toBeLessThan(target.x + target.width);
    }
  });

  it("slides a diagonal bundle along the borders it is anchored to (#2477)", () => {
    // The nudge is perpendicular to the chord, which for a diagonal edge would
    // lift both ends off the outline #2422 seated them on. A third service
    // pushes the expanded frame sideways so the chord runs diagonally.
    const KRS_DIAGONAL = `
system T {
  service S1 { domain A { usecase u } }
  service S1b { domain C { usecase w } }
  service S2 { domain B { usecase v } }
  S1 -> S2
  S1 --> S2
  S1b -> S2
}
`;
    const systems = Parser.parse(KRS_DIAGONAL).value.systems;
    const result = layout(extractView(systems, [], [], [], new Set(["S2"])));
    const bundle = result.edges.filter((e) => e.from === "S1" && e.to === "S2");
    expect(bundle).toHaveLength(2);
    const s1 = result.nodes.get("S1")!;
    const frame = result.containers.find((c) => c.nodeId === "S2")!;
    // Diagonal: the two ends differ on both axes.
    expect(bundle[0].fromPoint.x).not.toBeCloseTo(bundle[0].toPoint.x);
    expect(bundle[0].fromPoint.y).not.toBeCloseTo(bundle[0].toPoint.y);
    for (const edge of bundle) {
      expect(edge.fromPoint.y).toBeCloseTo(s1.y);
      expect(edge.toPoint.y).toBeCloseTo(frame.y + frame.height);
    }
    expect(bundle[0].fromPoint.x).not.toBeCloseTo(bundle[1].fromPoint.x);
  });

  it("leaves parallel edges between collapsed services to distributePorts", () => {
    // The same model without expansion is the regression fence for the gate:
    // these edges are spread by ports, so the bundle pass must not move them.
    const KRS_PARALLEL = `
system T {
  service S1 { domain A { usecase u {} } }
  service S2 { domain B { usecase v {} } }
  S1 -> S2
  S1 --> S2
}
`;
    const systems = Parser.parse(KRS_PARALLEL).value.systems;
    const result = layout(extractView(systems, [], [], []));
    const bundle = result.edges.filter((e) => e.from === "S1" && e.to === "S2");
    expect(bundle).toHaveLength(2);
    const s1 = result.nodes.get("S1")!;
    // i/(N+1) across S1's bottom side — the ports distributePorts assigns.
    expect(bundle[0].fromPoint.x).toBeCloseTo(s1.x + s1.width / 3);
    expect(bundle[1].fromPoint.x).toBeCloseTo(s1.x + (s1.width * 2) / 3);
  });
});

describe("layout — in-place expansion keeps parallel edges apart (#2490, via #2598)", () => {
  // #2490's repro, carried into #2598 when the issue was consolidated: three
  // services expanded in place, with a sync and an async edge S1 -> S3. The
  // reported state had both edges sharing a corridor waypoint and a target
  // anchor after `fanOutGutterPorts` split only their source ports.
  const REPRO = `
system T {
  service S1 { domain A { usecase u } }
  service S2 { domain B { usecase v } }
  service S3 { domain C { usecase w } }
  S1 -> S3
  S1 --> S3
  S1 -> S2
  S2 -> S3
}
`;
  const result = () => {
    const systems = Parser.parse(REPRO).value.systems;
    return layout(extractView(systems, [], [], [], new Set(["S1", "S2", "S3"])));
  };
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

  it("gives the two S1 -> S3 edges distinct target anchors", () => {
    const pair = result().edges.filter((e) => e.from === "S1" && e.to === "S3");
    expect(pair).toHaveLength(2);
    expect(key(pair[0].toPoint)).not.toBe(key(pair[1].toPoint));
    expect(key(pair[0].fromPoint)).not.toBe(key(pair[1].fromPoint));
  });

  it("lays no collinear segment of one on a segment of the other", () => {
    const pair = result().edges.filter((e) => e.from === "S1" && e.to === "S3");
    const segs = (e: (typeof pair)[number]) => {
      const pts = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
      return pts.slice(1).map((b, i) => [pts[i], b] as const);
    };
    for (const [a0, a1] of segs(pair[0])) {
      for (const [b0, b1] of segs(pair[1])) {
        const vertical = a0.x === a1.x && b0.x === b1.x && a0.x === b0.x;
        const horizontal = a0.y === a1.y && b0.y === b1.y && a0.y === b0.y;
        if (!vertical && !horizontal) continue;
        const lo: "x" | "y" = vertical ? "y" : "x";
        const shared =
          Math.min(Math.max(a0[lo], a1[lo]), Math.max(b0[lo], b1[lo])) -
          Math.max(Math.min(a0[lo], a1[lo]), Math.min(b0[lo], b1[lo]));
        expect(shared).toBeLessThanOrEqual(0);
      }
    }
  });

  it("keeps every edge clear of the frames it does not belong to", () => {
    const res = result();
    const frames = res.containers.filter((c) => c.expanded);
    for (const e of res.edges) {
      const others = frames.filter((f) => f.nodeId !== e.from && f.nodeId !== e.to);
      const pts = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
      expect(countPolylinePenetrations(pts, others)).toBe(0);
    }
  });
});
