import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { layout } from "./layout.js";
import { groupOrderFor, resolvePlacementAxis } from "./group-layout.js";
import { declaredGroupOrderOf } from "./group-labels.js";
import { extractView } from "../view/view-extract.js";
import { boundaryScopeKey, primaryBoundaryOf } from "../types/ast.js";
import { InMemoryFileSystemProvider, compileProject } from "../index.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { compileSystemDiff } from "../compile/compile-diff.js";
import { buildAllLayersSvg } from "./all-layers-svg.js";
import { buildDrillDownSvg } from "./drill-down-svg.js";

// Boundary membership is 1:N at the model layer (#2178, refines ADR-1974
// decision 2). The perspective this file fences is TPL-2161: a derived index
// must not drop declared facts because one view can only draw a single value.
//
// Slice A is model-only — placement does not move, and the frames a
// multi-membership node belongs to are #2179 / #2176. What must hold here is
// that every declaration survives parsing *and* every merge path, that the
// single-value need is met by one pure function, and that group existence stops
// being derived from the axis map's values.

const MULTI_SRC = `
system Shop {
  service Billing {}
  service Wallet {}
  service Ledger {}
}
boundary payments {
  label "Payments"
  contains Billing
  contains Wallet
}
boundary finance {
  label "Finance"
  contains Billing
  contains Ledger
}
`;

describe("boundary membership is 1:N at the model layer", () => {
  it("keeps every declared membership in declaration order", () => {
    const { value } = Parser.parse(MULTI_SRC);
    expect(value.boundaryMembership.get("Billing")).toEqual(["payments", "finance"]);
    expect(value.boundaryMembership.get("Wallet")).toEqual(["payments"]);
    expect(value.boundaryMembership.get("Ledger")).toEqual(["finance"]);
  });

  it("resolves the single value a banded view needs through one pure function", () => {
    const { value } = Parser.parse(MULTI_SRC);
    // The one place 1:N meets the view's one-band-per-node rule. No parallel
    // 1:1 field exists to drift against it (TPL-1032).
    expect(primaryBoundaryOf(value.boundaryMembership.get("Billing"))).toBe("payments");
    expect(primaryBoundaryOf(value.boundaryMembership.get("Nope"))).toBeUndefined();
    expect(primaryBoundaryOf([])).toBeUndefined();
  });
});

describe("every merge path agrees on the 1:N semantics", () => {
  it("multi-file import unions memberships instead of keeping the first file's", async () => {
    // First-wins here would resurrect across files exactly the truncation the
    // parser stopped doing — the failure mode TPL-2161 calls "merge での再発".
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./finance.krs"
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
}
`,
    );
    await fs.writeFile(
      "/p/finance.krs",
      `boundary finance {
  contains Billing
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.krsFile.boundaryMembership.get("Billing")).toEqual(["payments", "finance"]);
  });

  it("carries a boundary declared in an imported file into the merged model", async () => {
    // `contains` is a by-reference relation that crosses files by design, but
    // the whole-file merge never carried the block or its membership — the
    // declaration parsed and vanished (TPL-1503), so it could not be labelled,
    // could not open the Group-by gate, and framed nothing.
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./cluster.krs"
system Shop {
  service Billing {}
}
`,
    );
    await fs.writeFile(
      "/p/cluster.krs",
      `boundary payments {
  label "Payments"
  contains Billing
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.krsFile.boundaries.map((b) => b.id)).toEqual(["payments"]);
    expect(resolved.krsFile.boundaryMembership.get("Billing")).toEqual(["payments"]);
    expect(resolved.diagnostics.filter((d) => d.code === "contains-target-not-found")).toEqual([]);

    const result = await compileProject("/p/index.krs", fs, { groupBy: "boundary" });
    expect(result.svg).toContain('data-container-id="__group_payments__"');
  });

  it("multi-file import is idempotent when both files declare the same membership", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./again.krs"
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
}
`,
    );
    await fs.writeFile("/p/again.krs", `boundary payments {\n  contains Billing\n}\n`);
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.krsFile.boundaryMembership.get("Billing")).toEqual(["payments"]);
  });

  it("scoped membership unions per scope and stays keyed by (scope, id)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `system Shop {
  service Checkout {
    boundary core { contains Ledger }
    boundary audit { contains Ledger }
    domain Ledger {}
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    const scope = resolved.krsFile.scopedBoundaryMembership.get(
      boundaryScopeKey(["Shop", "Checkout"]),
    );
    expect(scope?.get("Ledger")).toEqual(["core", "audit"]);
  });

  it("diff restores a removed node's whole before-side membership, and only for removed nodes", async () => {
    // ADR-1886's guard applied per array: a node that merely lost a `contains`
    // must not inherit its stale before membership.
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/before.krs",
      `system Shop {
  service Billing {}
  service Wallet {}
}
boundary payments {
  contains Billing
  contains Wallet
}
boundary finance {
  contains Billing
}
`,
    );
    await fs.writeFile(
      "/p/after.krs",
      `system Shop {
  service Wallet {}
}
boundary payments {
  contains Wallet
}
boundary finance {
}
`,
    );
    const before = await new ImportResolver(fs).resolve("/p/before.krs");
    const after = await new ImportResolver(fs).resolve("/p/after.krs");
    expect(before.krsFile.boundaryMembership.get("Billing")).toEqual(["payments", "finance"]);
    // Billing is removed in after, so the diff render must be able to put it
    // back in its former frame; Wallet is kept and keeps only its after state.
    expect(after.krsFile.boundaryMembership.has("Billing")).toBe(false);

    const result = await compileSystemDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
      groupBy: "boundary",
    });
    expect(result.nodeDiff.get("Billing")?.state).toBe("removed");
    // The removed node is drawn inside its former (primary) frame rather than
    // dropping into the trailing un-grouped band.
    expect(result.svg).toContain('data-node-id="Billing"');
    expect(result.svg).toContain('data-container-id="__group_payments__"');
  });
});

describe("group existence comes from the declaration, not the axis map", () => {
  it("keeps a boundary whose members are all claimed by an earlier one in the group order", () => {
    // `shared`'s only member is already Billing's primary, so it never appears
    // as a value of the axis map — the failure mode TPL-2161 calls
    // "群そのものの消失". Placement still owes it a band (#2176); the order is
    // what slice A restores.
    const src = `
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
}
boundary shared {
  contains Billing
}
`;
    const { value } = Parser.parse(src);
    const declared = declaredGroupOrderOf(value, "boundary");
    expect(declared).toEqual(["payments", "shared"]);

    const axis = new Map([["Billing", "payments"]]);
    expect(groupOrderFor(axis, undefined)).toEqual(["payments"]);
    expect(groupOrderFor(axis, declared)).toEqual(["payments", "shared"]);
  });

  it("keeps a boundary with no members at all in the group order", () => {
    const { value } = Parser.parse(`boundary empty {\n  label "Empty"\n}\n`);
    expect(value.boundaryMembership.size).toBe(0);
    expect(groupOrderFor(new Map(), declaredGroupOrderOf(value, "boundary"))).toEqual(["empty"]);
  });

  it("leaves the order of groups that do have members exactly as the axis had it", () => {
    // The axis run comes first, so band order — and with it the tie-break in
    // `orderGroups` — is unchanged for every model that has no shadowed group.
    // A flatten of the membership would reorder here: declaration order is
    // a, c, b, but b is reached through its non-primary membership of N1.
    const axis = new Map([
      ["N1", "a"],
      ["N2", "c"],
      ["N3", "b"],
    ]);
    expect(groupOrderFor(axis, ["a", "c", "b"])).toEqual(["a", "c", "b"]);
  });
});

describe("placement moves only to give a boundary a band (#2176)", () => {
  // Slice A placed strictly on the primary axis. #2176 keeps that as the rule
  // and adds exactly one exception: a boundary whose members are *all* claimed
  // by an earlier one has nothing to band, so it takes one of its shared
  // members and gets a body. Everything else still lands on its primary.
  const render = (src: string) => {
    const parsed = Parser.parse(src).value;
    const slice = extractView(parsed.systems, ["Shop"]);
    return layout(slice, {
      boundaryMembership: parsed.boundaryMembership,
      declaredGroupOrder: declaredGroupOrderOf(parsed, "boundary"),
      groupBy: "boundary",
    });
  };
  const positions = (src: string): [string, number, number][] =>
    [...render(src).nodes].map(([id, n]) => [id, n.x, n.y]);
  const frames = (src: string): string[] =>
    render(src)
      .containers.filter((c) => c.group === true)
      .map((c) => c.id);

  const TWO_BANDED = `
system Shop {
  service Billing {}
  service Wallet {}
  service Ledger {}
}
boundary payments {
  contains Billing
  contains Wallet
}
boundary audit {
  contains Ledger
}
`;

  it("a second membership moves nothing when the other boundary already has a band", () => {
    // `audit` bands `Ledger` on its own, so it needs no claim and `Billing`
    // stays where its primary put it.
    const shared = TWO_BANDED.replace(
      "  contains Ledger\n",
      "  contains Ledger\n  contains Billing\n",
    );
    expect(positions(shared)).toEqual(positions(TWO_BANDED));
  });

  it("a boundary whose members are all shared claims one, so it gets a frame", () => {
    const bandless = `
system Shop {
  service Billing {}
  service Wallet {}
}
boundary payments {
  contains Billing
  contains Wallet
}
boundary finance {
  contains Billing
}
`;
    // Before #2176 `finance` was declared, labelled, and drawn nowhere.
    expect(frames(bandless)).toEqual(["__group_payments__", "__group_finance__"]);
  });

  it("does not empty one band to fill another", () => {
    // `payments` has a single member, and it is the only candidate `finance`
    // could claim. Taking it would just move the hole, so no claim is made.
    const soleMember = `
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
}
boundary finance {
  contains Billing
}
`;
    expect(frames(soleMember)).toEqual(["__group_payments__"]);
  });

  it("places every node exactly once whether or not a claim happens (TPL-1738)", () => {
    for (const src of [TWO_BANDED, MULTI_SRC]) {
      const res = render(src);
      const ids = [...res.nodes.keys()];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("bands boundaries that share a member next to each other, with the member on the seam", () => {
    // Three boundaries with no dependency edges between them: every band order
    // ties and declaration order wins today. The Ledger share is the only thing
    // that can break the tie — and it must, because two frames can overlap over
    // a shared card only when their bands touch (#2179).
    const shared = `
system Shop {
  service Checkout {}
  service Ledger {}
  service Catalog {}
  service Audit {}
  Checkout -> Ledger "record"
}
boundary payments {
  contains Checkout
  contains Ledger
}
boundary catalog {
  contains Catalog
}
boundary risk {
  contains Ledger
  contains Audit
}
`;
    const res = render(shared);
    const bandTop = (groupId: string): number =>
      res.containers.find((c) => c.id === `__group_${groupId}__`)!.y;
    // Declared payments, catalog, risk — catalog shares nothing, so it is the
    // band that moves out from between the two that do.
    expect(
      ["payments", "catalog", "risk"]
        .map((g) => [g, bandTop(g)] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([g]) => g),
    ).toEqual(["payments", "risk", "catalog"]);
    // And Ledger takes payments' bottom row — the row that touches `risk`.
    expect(res.nodes.get("Ledger")!.y).toBeGreaterThan(res.nodes.get("Checkout")!.y);
    expect(bandTop("risk")).toBeGreaterThan(res.nodes.get("Ledger")!.y);
  });

  it("resolvePlacementAxis agrees with primaryBoundaryOf wherever no claim is made (TPL-1032)", () => {
    // `resolvePlacementAxis` spells out the primary rule instead of importing
    // it, so the two definitions are pinned to the same answer here.
    const parsed = Parser.parse(MULTI_SRC).value;
    const present = new Set(["Billing", "Wallet", "Ledger"]);
    const { axis } = resolvePlacementAxis(
      parsed.boundaryMembership,
      declaredGroupOrderOf(parsed, "boundary"),
      present,
    );
    for (const [nodeId, ids] of parsed.boundaryMembership) {
      expect(axis.get(nodeId)).toBe(primaryBoundaryOf(ids));
    }
  });
});

describe("the axis reaches every render surface (TPL-219)", () => {
  // A missed call site drops the axis silently — the frames simply do not
  // appear, with no error anywhere. Each surface is asserted on the same
  // multi-membership model, so a renamed field caught in one place but not
  // another cannot pass.
  const DRILL_SRC = `
system Shop {
  service Orders {
    domain OrderDomain {}
    domain ShippingDomain {}
  }
}
boundary cluster {
  label "Cluster"
  contains OrderDomain
}
boundary shared {
  label "Shared"
  contains OrderDomain
  contains ShippingDomain
}
`;

  it("compileProject frames the boundary", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/p/index.krs", MULTI_SRC);
    const result = await compileProject("/p/index.krs", fs, { groupBy: "boundary" });
    expect(result.svg).toContain('data-container-id="__group_payments__"');
    expect(result.svg).toContain('data-container-id="__group_finance__"');
  });

  it("buildDrillDownSvg frames the boundary on the drill level", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const { svg } = buildDrillDownSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(svg).toContain('data-container-id="__group_cluster__"');
  });

  it("buildAllLayersSvg frames the boundary", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const { svg } = buildAllLayersSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(svg).toContain('data-container-id="__group_cluster__"');
  });

  it("compileSystemDiff frames the boundary", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/p/before.krs", MULTI_SRC);
    await fs.writeFile("/p/after.krs", MULTI_SRC);
    const result = await compileSystemDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
      groupBy: "boundary",
    });
    expect(result.svg).toContain('data-container-id="__group_payments__"');
    expect(result.svg).toContain('data-container-id="__group_finance__"');
  });
});
