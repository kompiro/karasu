// Scoped `boundary` declarations (#2036) — a `boundary` block written *inside* a
// node block, whose members are that node's direct children.
//
// The point of the form is that it cannot express the ambiguity top-level
// `boundary` has: node ids are unique only among siblings, so a top-level
// `contains X` silently frames every `X` in the model, while a scoped one can
// only ever name one node. The first describe below pins that difference.

import { describe, expect, it } from "vitest";
import { Parser } from "./parser.js";
import { boundaryScopeKey, type LogicalNodeKind } from "../types/ast.js";

/** The #2036 probe: the same id declared at two levels, which is legal (ADR-927). */
const COLLIDING_IDS = `
system Shop {
  service Payment { domain Ledger {} }
  service Checkout { domain Payment {} }
}
`;

describe("scoped boundary — the ambiguity it removes", () => {
  it("top-level contains still frames every same-id node (the #2036 symptom, unchanged)", () => {
    const result = Parser.parse(`${COLLIDING_IDS}
boundary b "B" { contains Payment }
`);
    // Documents today's behaviour rather than endorsing it: the flat index maps
    // the *id*, so both the service and the nested domain resolve to it.
    expect(result.value.boundaryIndex.get("Payment")).toBe("b");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("a scoped contains names exactly one node — the sibling set it is written in", () => {
    const result = Parser.parse(`
system Shop {
  service Payment { domain Ledger {} }
  service Checkout {
    boundary b "B" { contains Payment }
    domain Payment {}
  }
}
`);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Only Checkout's scope gains membership; the top-level service Payment is
    // untouched even though it shares the id.
    const checkout = result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop", "Checkout"]));
    expect(checkout?.get("Payment")).toBe("b");
    expect(result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop"]))).toBeUndefined();
    expect(result.value.boundaryIndex.size).toBe(0);
  });

  it("the same boundary id in two scopes stays two independent memberships", () => {
    const result = Parser.parse(`
system Shop {
  boundary core "Core" { contains Checkout }
  service Checkout {
    boundary core "Core" { contains Ledger }
    domain Ledger {}
  }
}
`);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop"]))?.get("Checkout")).toBe(
      "core",
    );
    expect(
      result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop", "Checkout"]))?.get("Ledger"),
    ).toBe("core");
  });
});

describe("scoped boundary — member resolution", () => {
  it("resolves direct children only, leaving a grandchild unindexed", () => {
    const result = Parser.parse(`
system Shop {
  service Checkout {
    boundary b "B" { contains Ledger  contains Entry }
    domain Ledger { usecase Entry {} }
  }
}
`);
    const scope = result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop", "Checkout"]));
    expect(scope?.get("Ledger")).toBe("b");
    // `Entry` is a grandchild: it is not drawn on Checkout's canvas, and it sits
    // outside the sibling-uniqueness guarantee the form relies on.
    expect(scope?.has("Entry")).toBe(false);

    // Dropping it silently would be parse-and-vanish (TPL-20260610-01), so the
    // out-of-scope member is reported rather than ignored.
    const notFound = result.diagnostics.filter((d) => d.code === "contains-target-not-found");
    expect(notFound).toHaveLength(1);
    expect(JSON.stringify(notFound[0].params)).toContain("Entry");
  });

  it("keeps the first-declared boundary when a child is listed twice (info, mirroring top-level)", () => {
    const result = Parser.parse(`
system Shop {
  service Checkout {
    boundary one "One" { contains Ledger }
    boundary two "Two" { contains Ledger }
    domain Ledger {}
  }
}
`);
    const dup = result.diagnostics.filter((d) => d.code === "duplicate-boundary-assignment");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("info");
    expect(
      result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop", "Checkout"]))?.get("Ledger"),
    ).toBe("one");
  });
});

describe("scoped boundary — placement", () => {
  // Every kind, so a new LogicalNodeKind cannot be added without deciding where
  // a boundary may sit (TPL-20260623-02). `true` = hosts a boundary.
  const PLACEMENT = {
    system: true,
    service: true,
    domain: true,
    usecase: true,
    database: true,
    queue: true,
    storage: true,
    entity: false,
    resource: false,
    user: false,
    client: false,
    table: false,
    "queue-item": false,
    bucket: false,
  } as const satisfies Record<LogicalNodeKind, boolean>;

  const HOSTS: Partial<Record<LogicalNodeKind, string>> = {
    system: `system Shop { boundary b { contains Checkout } service Checkout {} }`,
    service: `system Shop { service Checkout { boundary b { contains Ledger } domain Ledger {} } }`,
    domain: `system Shop { service S { domain D { boundary b { contains Draft } usecase Draft {} } } }`,
    usecase: `system Shop { service S { domain D { usecase U { boundary b { contains R } resource R {} } } } }`,
    database: `system Shop { database DB { boundary b { contains orders } table orders {} } }`,
    // A queue's leaf items are declared with the `queue` keyword, and ids avoid
    // deploy keywords (`job`, `assets`), which lex as keywords rather than ids.
    queue: `system Shop { queue Q { boundary b { contains Jobs } queue Jobs {} } }`,
    storage: `system Shop { storage S3 { boundary b { contains Media } bucket Media {} } }`,
  };

  const REJECTED: Partial<Record<LogicalNodeKind, string>> = {
    entity: `system Shop { service S { domain D { entity E { boundary b { contains X } } } } }`,
    client: `system Shop { client C { boundary b { contains X } } }`,
    user: `system Shop { user U { boundary b { contains X } } }`,
    table: `system Shop { database DB { table orders { boundary b { contains X } } } }`,
  };

  // Every host kind in PLACEMENT must have a fixture, so a kind flipped to
  // `true` without one fails here rather than going untested.
  it("has a fixture for every kind PLACEMENT says can host a boundary", () => {
    const hosts = Object.entries(PLACEMENT)
      .filter(([, accepted]) => accepted)
      .map(([kind]) => kind);
    expect(Object.keys(HOSTS).sort()).toEqual(hosts.sort());
  });

  for (const [kind, source] of Object.entries(HOSTS) as [LogicalNodeKind, string][]) {
    it(`accepts a boundary declared inside ${kind}`, () => {
      const result = Parser.parse(source);
      expect(result.diagnostics.filter((d) => d.code === "boundary-not-in-context")).toHaveLength(
        0,
      );
      expect(result.value.scopedBoundaryIndex.size).toBeGreaterThan(0);
    });
  }

  for (const [kind, source] of Object.entries(REJECTED) as [LogicalNodeKind, string][]) {
    it(`rejects a boundary declared inside ${kind}`, () => {
      const result = Parser.parse(source);
      const misplaced = result.diagnostics.filter((d) => d.code === "boundary-not-in-context");
      expect(misplaced).toHaveLength(1);
      expect(misplaced[0].severity).toBe("error");
      expect(JSON.stringify(misplaced[0].params)).toContain(kind);
    });
  }

  it("recovers cleanly after a misplaced boundary, still parsing the rest of the block", () => {
    const result = Parser.parse(`
system Shop {
  client Web {
    boundary b "B" { contains Nothing }
    label "Web app"
  }
}
`);
    expect(result.diagnostics.filter((d) => d.code === "boundary-not-in-context")).toHaveLength(1);
    // The misplaced block is consumed whole, so the property after it is not
    // swallowed by error recovery.
    const client = result.value.systems[0].children.find((n) => n.id === "Web");
    expect(client?.label).toBe("Web app");
  });
});

describe("scoped boundary — duplicate ids", () => {
  it("errors when one scope declares the same boundary id twice", () => {
    const result = Parser.parse(`
system Shop {
  service Checkout {
    boundary core "One" { contains Ledger }
    boundary core "Two" { contains Cart }
    domain Ledger {}
    domain Cart {}
  }
}
`);
    const dup = result.diagnostics.filter((d) => d.code === "duplicate-boundary-id");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("error");
    expect(JSON.stringify(dup[0].params)).toContain("core");

    // The second block is unaddressable, so its members are not indexed.
    const scope = result.value.scopedBoundaryIndex.get(boundaryScopeKey(["Shop", "Checkout"]));
    expect(scope?.get("Ledger")).toBe("core");
    expect(scope?.has("Cart")).toBe(false);
  });

  it("leaves top-level duplicate ids alone (existing models keep merging)", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
  service Wallet {}
}
boundary pay "One" { contains Billing }
boundary pay "Two" { contains Wallet }
`);
    expect(result.diagnostics.filter((d) => d.code === "duplicate-boundary-id")).toHaveLength(0);
    expect(result.value.boundaryIndex.get("Billing")).toBe("pay");
    expect(result.value.boundaryIndex.get("Wallet")).toBe("pay");
  });
});

describe("scoped boundary — scope key", () => {
  it("distinguishes paths that a separator-joined key would collide", () => {
    // Ids may be quoted strings and hold any character, so ["A B"] must not key
    // the same as ["A", "B"] (TPL-20260512-01).
    expect(boundaryScopeKey(["A B"])).not.toBe(boundaryScopeKey(["A", "B"]));
  });
});
