import { describe, it, expect } from "vitest";
import {
  orderGroups,
  assignGroupedLayers,
  type GroupedNode,
  type GroupedEdge,
  type GroupEdgeWeights,
} from "./group-layout.js";

function weights(pairs: [string, string, number][]): GroupEdgeWeights {
  const m: GroupEdgeWeights = new Map();
  for (const [a, b, w] of pairs) {
    let tos = m.get(a);
    if (!tos) {
      tos = new Map();
      m.set(a, tos);
    }
    tos.set(b, w);
  }
  return m;
}

describe("orderGroups", () => {
  it("returns declaration order for a clean chain a → b → c", () => {
    const order = orderGroups(
      ["a", "b", "c"],
      weights([
        ["a", "b", 1],
        ["b", "c", 1],
      ]),
    );
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("reorders so dependencies flow downward", () => {
    // declared c, b, a but edges say a → b → c
    const order = orderGroups(
      ["c", "b", "a"],
      weights([
        ["a", "b", 1],
        ["b", "c", 1],
      ]),
    );
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("keeps declaration order as the deterministic tie-break when nothing distinguishes", () => {
    // no edges at all → every permutation scores 0 → identity (declared) wins
    expect(orderGroups(["x", "y", "z"], new Map())).toEqual(["x", "y", "z"]);
  });

  it("minimises backward-edge weight on a cyclic group graph (SCC still yields a total order)", () => {
    // a↔b cycle but a→b is heavier, so a→b should be forward and b→a the single back edge
    const order = orderGroups(
      ["b", "a"],
      weights([
        ["a", "b", 3],
        ["b", "a", 1],
      ]),
    );
    expect(order).toEqual(["a", "b"]);
  });

  it("produces a total order for a 4-group SCC (design measurement 4 shape)", () => {
    const order = orderGroups(
      ["catalog", "fulfillment", "platform", "payments"],
      weights([
        ["platform", "fulfillment", 1],
        ["platform", "catalog", 1],
        ["fulfillment", "payments", 1],
        ["fulfillment", "catalog", 1],
        ["catalog", "payments", 1],
        ["payments", "platform", 1],
      ]),
    );
    expect(order).toHaveLength(4);
    expect(new Set(order)).toEqual(new Set(["catalog", "fulfillment", "platform", "payments"]));
  });

  it("is deterministic (same input → same output) across the greedy branch (> 8 groups)", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `g${i}`);
    const w = weights([
      ["g0", "g1", 2],
      ["g1", "g2", 1],
      ["g9", "g0", 1],
      ["g5", "g3", 1],
      ["g3", "g8", 2],
    ]);
    const a = orderGroups(ids, w);
    const b = orderGroups(ids, w);
    expect(a).toEqual(b);
    expect(new Set(a)).toEqual(new Set(ids));
  });
});

describe("assignGroupedLayers", () => {
  const node = (id: string, groupId: string | null, ungroupedRank = 0): GroupedNode => ({
    id,
    groupId,
    ungroupedRank,
  });

  it("returns null when there are no groups (fallback to ungrouped layout)", () => {
    const nodes = [node("a", null), node("b", null)];
    expect(assignGroupedLayers(nodes, [], [])).toBeNull();
    // an org whose teams own nothing present → declaredGroupOrder present but no members
    expect(assignGroupedLayers(nodes, [], ["team-x"])).toBeNull();
  });

  it("places every node exactly once (TPL-20260624-02: totality & uniqueness)", () => {
    const nodes = [
      node("Billing", "payments"),
      node("Wallet", "payments"),
      node("Search", "catalog"),
      node("Catalog", "catalog"),
      node("OrderDB", null, 0),
      node("Stripe", null, 1),
    ];
    const edges: GroupedEdge[] = [
      { from: "Billing", to: "Wallet" },
      { from: "Search", to: "Catalog" },
      { from: "Billing", to: "OrderDB" },
      { from: "Billing", to: "Stripe" },
    ];
    const res = assignGroupedLayers(nodes, edges, ["payments", "catalog"])!;
    expect(res.layers.size).toBe(nodes.length);
    for (const n of nodes) expect(res.layers.has(n.id)).toBe(true);
  });

  it("gives each group a contiguous, non-overlapping row band (frames cannot overlap)", () => {
    const nodes = [node("a1", "A"), node("a2", "A"), node("b1", "B"), node("b2", "B")];
    const edges: GroupedEdge[] = [
      { from: "a1", to: "a2" },
      { from: "b1", to: "b2" },
    ];
    const res = assignGroupedLayers(nodes, edges, ["A", "B"])!;
    const A = res.groupBands.get("A")!;
    const B = res.groupBands.get("B")!;
    // every member sits inside its band
    for (const id of ["a1", "a2"]) {
      const l = res.layers.get(id)!;
      expect(l).toBeGreaterThanOrEqual(A.min);
      expect(l).toBeLessThanOrEqual(A.max);
    }
    // bands are disjoint and ordered — the guarantee P1 measurement 1 showed the
    // flat layout could not provide (8/10 team frames overlapped there).
    expect(A.max).toBeLessThan(B.min);
  });

  it("lays a group's members out by intra-group longest path", () => {
    const nodes = [node("a", "G"), node("b", "G"), node("c", "G")];
    const edges: GroupedEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    const res = assignGroupedLayers(nodes, edges, ["G"])!;
    expect(res.layers.get("a")).toBeLessThan(res.layers.get("b")!);
    expect(res.layers.get("b")).toBeLessThan(res.layers.get("c")!);
  });

  it("keeps the user → client → service(team) → infra → external flow around the bands", () => {
    // ranks mirror systemTier: user=0, client=1, service(grouped)=2, infra=3, external=4.
    const nodes = [
      node("user", null, 0),
      node("client", null, 1),
      node("Billing", "payments"),
      node("infra", null, 3),
      node("ext", null, 4),
    ];
    const res = assignGroupedLayers(nodes, [], ["payments"])!;
    const band = res.groupBands.get("payments")!;
    // actors / clients above the team band …
    expect(res.layers.get("user")!).toBeLessThan(band.min);
    expect(res.layers.get("client")!).toBeLessThan(band.min);
    expect(res.layers.get("user")!).toBeLessThan(res.layers.get("client")!);
    // … infra and external below it, in tier order.
    expect(res.layers.get("infra")!).toBeGreaterThan(band.max);
    expect(res.layers.get("ext")!).toBeGreaterThan(res.layers.get("infra")!);
  });

  it("puts un-owned service-tier nodes below the team bands, above infra", () => {
    const nodes = [
      node("Owned", "G"),
      node("Unowned", null, 2), // service tier, no team
      node("infra", null, 3),
    ];
    const res = assignGroupedLayers(nodes, [], ["G"])!;
    const G = res.groupBands.get("G")!;
    expect(res.layers.get("Unowned")!).toBeGreaterThan(G.max);
    expect(res.layers.get("infra")!).toBeGreaterThan(res.layers.get("Unowned")!);
  });
});
