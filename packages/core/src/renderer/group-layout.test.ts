import { describe, it, expect } from "vitest";
import {
  orderGroups,
  assignGroupedLayers,
  resolvePlacementAxis,
  type GroupedNode,
  type GroupedEdge,
  type GroupEdgeWeights,
  type CoMembershipWeights,
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

  it("places every node exactly once (TPL-1738: totality & uniqueness)", () => {
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

describe("co-membership band ordering (#2176)", () => {
  const co = (pairs: [string, string, number][]): CoMembershipWeights => {
    const m: CoMembershipWeights = new Map();
    const bump = (a: string, b: string, n: number): void => {
      let tos = m.get(a);
      if (!tos) {
        tos = new Map();
        m.set(a, tos);
      }
      tos.set(b, n);
    };
    for (const [a, b, n] of pairs) {
      bump(a, b, n);
      bump(b, a, n);
    }
    return m;
  };

  it("pulls boundaries that share a member next to each other", () => {
    // Declared a, b, c with no dependency edges: today every permutation ties
    // and declaration order wins. A share between a and c breaks that tie.
    expect(orderGroups(["a", "b", "c"], new Map(), co([["a", "c", 1]]))).toEqual(["a", "c", "b"]);
  });

  it("never buys adjacency with a backward dependency edge", () => {
    // a → b → c is a clean chain; the a/c share would cost a back edge to
    // satisfy, and the feedback-arc-set terms rank above co-membership.
    const order = orderGroups(
      ["a", "b", "c"],
      weights([
        ["a", "b", 1],
        ["b", "c", 1],
      ]),
      co([["a", "c", 1]]),
    );
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("leaves the order untouched when nothing is shared", () => {
    // The term is identically 0 across permutations, so the comparison falls
    // through to span exactly as it did before #2176.
    const es = weights([["a", "b", 1]]);
    expect(orderGroups(["c", "a", "b"], es, new Map())).toEqual(orderGroups(["c", "a", "b"], es));
  });

  it("centres a boundary that shares with two others, breaking the remaining tie by declaration order", () => {
    // b and c both share with a, so a between them is the only order that
    // leaves nothing separated. Of the two such orders the earlier-declared one
    // wins, because `permutations` yields it first and the comparison is strict.
    const order = orderGroups(
      ["a", "b", "c"],
      new Map(),
      co([
        ["a", "b", 1],
        ["a", "c", 1],
      ]),
    );
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("improves adjacency greedily beyond the exhaustive limit without adding back edges", () => {
    // 9 groups → the Eades–Lin–Smyth branch. i0 and i8 share a member; the
    // swap pass may only close the gap where the arc set does not object.
    const ids = Array.from({ length: 9 }, (_, i) => `i${i}`);
    const chain = weights(
      ids.slice(0, -1).map((g, i) => [g, ids[i + 1], 1] as [string, string, number]),
    );
    const plain = orderGroups([...ids], chain);
    const shared = orderGroups([...ids], chain, co([["i0", "i8", 1]]));
    const back = (order: string[]): number => {
      const pos = new Map(order.map((g, i) => [g, i]));
      return ids.slice(0, -1).filter((g, i) => pos.get(ids[i + 1])! < pos.get(g)!).length;
    };
    expect(back(shared)).toBeLessThanOrEqual(back(plain));
  });
});

describe("seam placement (#2176)", () => {
  const shared = (id: string, groupId: string, memberships: string[]): GroupedNode => ({
    id,
    groupId,
    ungroupedRank: 0,
    memberships,
  });
  const plain = (id: string, groupId: string): GroupedNode => ({
    id,
    groupId,
    ungroupedRank: 0,
  });

  it("moves a shared member to the row that touches the band below", () => {
    const nodes = [
      plain("a1", "A"),
      plain("a2", "A"),
      shared("X", "A", ["A", "B"]),
      plain("b1", "B"),
    ];
    // a1 → a2 makes A two rows tall; X depends on nothing inside A, so without
    // the bias it sits on A's first row — the far side from B.
    const res = assignGroupedLayers(nodes, [{ from: "a1", to: "a2" }], ["A", "B"])!;
    const A = res.groupBands.get("A")!;
    expect(res.layers.get("X")).toBe(A.max);
  });

  it("leaves a shared member alone when something inside its band depends on it", () => {
    // X → a2 means X must stay above a2; the dependency flow outranks the seam.
    const nodes = [
      plain("a1", "A"),
      plain("a2", "A"),
      shared("X", "A", ["A", "B"]),
      plain("b1", "B"),
    ];
    const res = assignGroupedLayers(
      nodes,
      [
        { from: "a1", to: "a2" },
        { from: "X", to: "a2" },
      ],
      ["A", "B"],
    )!;
    const A = res.groupBands.get("A")!;
    expect(res.layers.get("X")).toBe(A.min);
    expect(res.layers.get("X")!).toBeLessThan(res.layers.get("a2")!);
  });

  it("ignores a co-membership that the dependency flow keeps non-adjacent", () => {
    // A → B → C pins B between the two, so no row of A touches C: reaching is
    // impossible whatever the bias would do, and the 縮退 tab answers instead.
    const nodes = [
      plain("a1", "A"),
      plain("a2", "A"),
      shared("X", "A", ["A", "C"]),
      plain("b1", "B"),
      plain("c1", "C"),
    ];
    const res = assignGroupedLayers(
      nodes,
      [
        { from: "a1", to: "a2" },
        { from: "a2", to: "b1" },
        { from: "b1", to: "c1" },
      ],
      ["A", "B", "C"],
    )!;
    expect(res.groupOrder).toEqual(["A", "B", "C"]);
    expect(res.layers.get("X")).toBe(res.groupBands.get("A")!.min);
  });

  it("places every node exactly once, biased or not (TPL-1738)", () => {
    const nodes = [
      plain("a1", "A"),
      plain("a2", "A"),
      shared("X", "A", ["A", "B"]),
      plain("b1", "B"),
      plain("free", null as unknown as string),
    ];
    const res = assignGroupedLayers(nodes, [{ from: "a1", to: "a2" }], ["A", "B"])!;
    expect(res.layers.size).toBe(nodes.length);
  });
});

describe("resolvePlacementAxis (#2176)", () => {
  const present = (...ids: string[]): ReadonlySet<string> => new Set(ids);

  it("places every node in its primary when no boundary is left bandless", () => {
    const membership = new Map([
      ["Billing", ["payments", "audit"]],
      ["Wallet", ["payments"]],
      ["Ledger", ["audit"]],
    ]);
    const { axis } = resolvePlacementAxis(
      membership,
      ["payments", "audit"],
      present("Billing", "Wallet", "Ledger"),
    );
    expect(axis.get("Billing")).toBe("payments");
    expect(axis.get("Ledger")).toBe("audit");
  });

  it("gives a boundary whose members are all shared a body", () => {
    const membership = new Map([
      ["Billing", ["payments", "finance"]],
      ["Wallet", ["payments"]],
    ]);
    const { axis } = resolvePlacementAxis(
      membership,
      ["payments", "finance"],
      present("Billing", "Wallet"),
    );
    expect(axis.get("Billing")).toBe("finance");
    expect(axis.get("Wallet")).toBe("payments");
  });

  it("refuses a claim that would empty the band it takes from", () => {
    const membership = new Map([["Billing", ["payments", "finance"]]]);
    const { axis } = resolvePlacementAxis(membership, ["payments", "finance"], present("Billing"));
    expect(axis.get("Billing")).toBe("payments");
  });

  it("only claims members present on this canvas", () => {
    // Ledger is declared in `finance` but drawn on another canvas, so it cannot
    // give `finance` a band here; Billing is the only candidate.
    const membership = new Map([
      ["Billing", ["payments", "finance"]],
      ["Wallet", ["payments"]],
      ["Ledger", ["finance"]],
    ]);
    const { axis } = resolvePlacementAxis(
      membership,
      ["payments", "finance"],
      present("Billing", "Wallet"),
    );
    expect(axis.get("Billing")).toBe("finance");
  });

  it("does not claim the same member twice", () => {
    const membership = new Map([
      ["Billing", ["payments", "finance", "risk"]],
      ["Wallet", ["payments"]],
    ]);
    const { axis } = resolvePlacementAxis(
      membership,
      ["payments", "finance", "risk"],
      present("Billing", "Wallet"),
    );
    // `finance` is resolved first and takes Billing; `risk` has no candidate
    // left and stays bandless rather than stealing it back.
    expect(axis.get("Billing")).toBe("finance");
  });

  it("keeps the band order seeded from the primary axis, not from the claim", () => {
    const membership = new Map([
      ["Billing", ["payments", "finance"]],
      ["Wallet", ["payments"]],
    ]);
    const { groupOrder } = resolvePlacementAxis(
      membership,
      ["payments", "finance"],
      present("Billing", "Wallet"),
    );
    expect(groupOrder).toEqual(["payments", "finance"]);
  });
});
