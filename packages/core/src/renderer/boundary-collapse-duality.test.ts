import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { layout } from "./layout.js";
import { declaredGroupOrderOf } from "./group-labels.js";
import { extractView } from "../view/view-extract.js";
import type { LayoutResult } from "./layout-types.js";

// Collapsing a boundary folds a *frame*, not a set of nodes (#2180, design
// Part C). Once a node can belong to several boundaries, "collapse A" must not
// remove that node from an expanded B — the operation the user performed and
// the effect they see would not match, and ADR-2036 established that collapse
// state belongs to each group separately.
//
// So a node folds only when **every** boundary it belongs to on this canvas is
// collapsed. The consequences fenced here: it stays visible (and keeps its edge
// endpoints) while any membership is expanded, it folds exactly once when they
// all are, and a collapsed boundary with nothing left to fold draws no stub
// rather than `A (0)`.

/** `Ledger` belongs to both boundaries; the others belong to one each. */
const SHARED = `
system Shop {
  service Checkout {}
  service Ledger {}
  service Wallet {}
  service CardVault {}

  Checkout -> Ledger "record"
  Checkout -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  contains Ledger
  contains CardVault
}
`;

/** `audit`'s only member is shared, so collapsing it can fold nothing. */
const ALL_SHARED = `
system Shop {
  service Checkout {}
  service Ledger {}

  Checkout -> Ledger "record"
}

boundary payments {
  contains Checkout
  contains Ledger
}

boundary audit {
  contains Ledger
}
`;

function laidOut(src: string, collapsed: string[]): LayoutResult {
  const parsed = Parser.parse(src).value;
  const slice = extractView(parsed.systems, ["Shop"]);
  return layout(slice, {
    boundaryMembership: parsed.boundaryMembership,
    declaredGroupOrder: declaredGroupOrderOf(parsed, "boundary"),
    groupBy: "boundary",
    collapsedGroups: new Set(collapsed),
  });
}

const stubs = (res: LayoutResult): string[] =>
  [...res.nodes.keys()].filter((id) => id.startsWith("__group_collapsed_"));
const labelOf = (res: LayoutResult, groupId: string): string | undefined =>
  res.nodes.get(`__group_collapsed_${groupId}__`)?.label;

describe("a shared node survives while any of its boundaries is expanded (#2180)", () => {
  it("stays visible when only one of its two boundaries collapses", () => {
    const res = laidOut(SHARED, ["payments"]);
    // Ledger is in the collapsed `payments`, but also in the expanded `pci`.
    expect(res.nodes.has("Ledger")).toBe(true);
    // Its exclusive siblings did fold, and the count is what actually folded.
    expect(res.nodes.has("Checkout")).toBe(false);
    expect(res.nodes.has("Wallet")).toBe(false);
    expect(labelOf(res, "payments")).toBe("payments (2)");
  });

  it("keeps the endpoints of edges that touch the still-visible node", () => {
    const res = laidOut(SHARED, ["payments"]);
    // `Checkout -> Ledger` re-targets only its folded end; Ledger keeps its id,
    // so the edge does not fall back to a container anchor (TPL-1738).
    const toLedger = res.edges.filter((e) => e.to === "Ledger");
    expect(toLedger).toHaveLength(1);
    expect(toLedger[0].from).toBe("__group_collapsed_payments__");
    // The edge that never touched the collapsed group is untouched.
    expect(res.edges.some((e) => e.from === "Ledger" && e.to === "CardVault")).toBe(true);
  });

  it("folds exactly once, into the group it was placed in, when all collapse", () => {
    const res = laidOut(SHARED, ["payments", "pci"]);
    expect(res.nodes.has("Ledger")).toBe(false);
    // Four nodes folded across two stubs — Ledger counted once, not in both.
    expect(labelOf(res, "payments")).toBe("payments (3)");
    expect(labelOf(res, "pci")).toBe("pci (1)");
  });

  it("collapsing the other boundary alone folds only its exclusive member", () => {
    const res = laidOut(SHARED, ["pci"]);
    expect(res.nodes.has("Ledger")).toBe(true);
    expect(res.nodes.has("CardVault")).toBe(false);
    expect(labelOf(res, "pci")).toBe("pci (1)");
  });
});

describe("a collapsed boundary with nothing to fold draws no stub (#2180)", () => {
  it("emits no stub when its only member stays visible through another frame", () => {
    const res = laidOut(ALL_SHARED, ["audit"]);
    expect(res.nodes.has("Ledger")).toBe(true);
    // Not `audit (0)` — nothing folded, so nothing stands in for it.
    expect(stubs(res)).toEqual([]);
  });

  it("does fold once the other boundary collapses too", () => {
    const res = laidOut(ALL_SHARED, ["audit", "payments"]);
    expect(res.nodes.has("Ledger")).toBe(false);
    expect(stubs(res).length).toBeGreaterThan(0);
  });
});

describe("bulk collapse keeps the group-dependency view (ADR-2120, #2180)", () => {
  it("folds every node exactly once across the stubs", () => {
    const res = laidOut(SHARED, ["payments", "pci"]);
    expect([...res.nodes.keys()].filter((id) => !id.startsWith("__"))).toEqual([]);
    // The two stubs and the edge between them: the DAG view ADR-2120 promises.
    expect(stubs(res).sort()).toEqual(["__group_collapsed_payments__", "__group_collapsed_pci__"]);
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toMatchObject({
      from: "__group_collapsed_payments__",
      to: "__group_collapsed_pci__",
    });
  });
});

describe("the team axis is untouched by the new predicate (#2180)", () => {
  const TEAM_SRC = `
system Shop {
  service Checkout {}
  service Ledger {}
}

organization Org {
  team platform {
    owns Checkout
    owns Ledger
  }
}
`;

  it("still folds on its own 1:1 predicate", () => {
    // No membership is passed on the team axis, so the predicate reduces to
    // "this node's group is collapsed" — the behaviour before #2180.
    const parsed = Parser.parse(TEAM_SRC).value;
    const slice = extractView(parsed.systems, ["Shop"]);
    const res = layout(slice, {
      ownerIndex: parsed.ownerIndex,
      groupBy: "team",
      collapsedGroups: new Set(["platform"]),
    });
    expect(res.nodes.has("Checkout")).toBe(false);
    expect(res.nodes.has("Ledger")).toBe(false);
    expect(res.nodes.get("__group_collapsed_platform__")?.label).toBe("platform (2)");
  });
});
