import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { ParseResult, KrsFile } from "../types/ast.js";

/**
 * #2550: `node-id-multiple-locations` must not depend on declaration order,
 * and the silent orders must not overwrite `nodePathIndex` (which viewPath /
 * deep permalinks resolve against). buildNodePathIndex collects candidates
 * during the walk and decides the verdict afterwards: winner =
 * @migration_target priority, ties keep the first in traversal order
 * (TPL-1583). The warning is a LOGICAL-layer verdict (PR #2570 review):
 * it fires only when two or more service / domain / client candidates share
 * the id and they are not all domains. Same names across the logical /
 * physical boundary and within the physical layer are tolerated silently
 * (physical refs are dot-qualified, #2078); all-domain multiplicity is
 * `domain-dispersal`'s business. Each case asserts BOTH the warning set and
 * the index entry; warning placement (the non-winner's own loc) is asserted
 * where the rule decides it.
 */

const warningsOf = (r: ParseResult<KrsFile>) =>
  r.diagnostics.filter((d) => d.code === "node-id-multiple-locations");

describe("node-id-multiple-locations is order-independent (#2550)", () => {
  it("row 1: service then nested domain — warns at the domain, the first-declared service keeps the entry", () => {
    const r = Parser.parse(`
system Shop {
  service Payment {}
  service Checkout {
    domain Payment {}
  }
}
`);
    const w = warningsOf(r);
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("warning");
    expect(w[0].params).toEqual({ nodeId: "Payment" });
    // The warning sits at the non-winner (the nested domain, line 5).
    expect(w[0].loc?.start.line).toBe(5);
    expect(r.value.nodePathIndex.get("Payment")).toEqual(["Shop", "Payment"]);
  });

  it("row 2: nested domain then service — the same verdict, the first-declared domain keeps the entry", () => {
    const r = Parser.parse(`
system Shop {
  service Checkout {
    domain Payment {}
  }
  service Payment {}
}
`);
    const w = warningsOf(r);
    expect(w).toHaveLength(1);
    // The warning moves with the non-winner: here the later service, line 6.
    expect(w[0].loc?.start.line).toBe(6);
    expect(r.value.nodePathIndex.get("Payment")).toEqual(["Shop", "Checkout", "Payment"]);
  });

  it("row 3: two nested domains stay silent (domain-dispersal narrates it), first wins", () => {
    const r = Parser.parse(`
system Shop {
  service A { domain Inner {} }
  service B { domain Inner {} }
}
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.value.nodePathIndex.get("Inner")).toEqual(["Shop", "A", "Inner"]);
  });

  // Logical vs physical same-name is a legal shape (a database named after
  // the service it backs); the layers are separate vocabularies.
  it.each([
    ["db first", "database Payment {}\nsystem Shop {\n  service Payment {}\n}\n"],
    ["db last", "system Shop {\n  service Payment {}\n}\ndatabase Payment {}\n"],
  ])(
    "row 4: top-level infra vs nested service is tolerated across layers, the service keeps the entry (%s)",
    (_label, src) => {
      const r = Parser.parse(src);
      expect(warningsOf(r)).toHaveLength(0);
      expect(r.value.nodePathIndex.get("Payment")).toEqual(["Shop", "Payment"]);
    },
  );

  it("row 5: the same service id in two systems warns and keeps the first (unchanged)", () => {
    const r = Parser.parse(`
system A { service Search {} }
system B { service Search {} }
`);
    expect(warningsOf(r)).toHaveLength(1);
    expect(r.value.nodePathIndex.get("Search")).toEqual(["A", "Search"]);
  });

  it("@migration_target wins the entry across logical kinds, and the multiplicity still warns", () => {
    const r = Parser.parse(`
system Shop {
  service Checkout {
    domain X {}
  }
  service X @migration_target {}
}
`);
    const w = warningsOf(r);
    expect(w).toHaveLength(1);
    // The non-winner (the domain, line 4) carries the warning; the entry
    // follows the priority winner even though it is declared second.
    expect(w[0].loc?.start.line).toBe(4);
    expect(r.value.nodePathIndex.get("X")).toEqual(["Shop", "X"]);
  });

  it("a 3-way collision warns only on the logical non-winner; the physical block is tolerated", () => {
    const r = Parser.parse(`
system Shop {
  service X {}
  service Checkout {
    domain X {}
  }
}
database X {}
`);
    const w = warningsOf(r);
    expect(w).toHaveLength(1);
    // The domain (line 5) lost the entry; the database never warns.
    expect(w[0].loc?.start.line).toBe(5);
    expect(r.value.nodePathIndex.get("X")).toEqual(["Shop", "X"]);
  });

  it("cross-system duplicate domains stay silent and follow priority-then-first, not last-wins", () => {
    const r = Parser.parse(`
system A { service S1 @migration_target { domain D {} } }
system B { service S2 @deprecated { domain D {} } }
`);
    expect(warningsOf(r)).toHaveLength(0);
    // The old walk reset its duplicate tracking per system, so the later
    // system silently overwrote the entry; the verdict now follows the
    // inherited migration priority across systems.
    expect(r.value.nodePathIndex.get("D")).toEqual(["A", "S1", "D"]);
  });
});

describe("the physical layer is a separate namespace (#2550, PR #2570 review)", () => {
  it("the same table id in two databases is silent; the first block keeps the entry", () => {
    const r = Parser.parse(`
database OrderDB { table users {} }
database BillingDB { table users {} }
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.value.nodePathIndex.get("users")).toEqual(["OrderDB", "users"]);
  });

  it("infra leaves inherit the block's migration annotations, so the target's table wins silently", () => {
    const r = Parser.parse(`
database LegacyDB @deprecated { table users {} }
database NewDB @migration_target { table users {} }
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.value.nodePathIndex.get("users")).toEqual(["NewDB", "users"]);
  });

  it("a top-level client outranks a same-id database in the traversal order, silently", () => {
    const r = Parser.parse(`
database Foo {}
client Foo {}
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.value.nodePathIndex.get("Foo")).toEqual(["Foo"]);
  });
});

describe("parked (system-less) logical nodes are indexed (#2550, PR #2570 review)", () => {
  it("a parked service gets an entry, and a same-id database coexists silently", () => {
    const r = Parser.parse(`
service Standalone {}
database Standalone {}
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.value.nodePathIndex.get("Standalone")).toEqual(["Standalone"]);
  });

  it("a parked service colliding with a walked service warns at the parked one", () => {
    const r = Parser.parse(`
system A { service X {} }
service X {}
`);
    const w = warningsOf(r);
    expect(w).toHaveLength(1);
    expect(w[0].loc?.start.line).toBe(3);
    expect(r.value.nodePathIndex.get("X")).toEqual(["A", "X"]);
  });
});

describe("same-path duplicates defer to duplicate-node-id-parent (#2550, PR #2570 review)", () => {
  it("a nested duplicate draws the parent-scope error only, not a second register", () => {
    const r = Parser.parse(`
database D {
  table T {}
  table T {}
}
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.diagnostics.filter((d) => d.code === "duplicate-node-id-parent")).toHaveLength(1);
  });

  it("a cross-kind duplicate under one parent also stays with the error", () => {
    const r = Parser.parse(`
system Shop {
  service X {}
  domain X {}
}
`);
    expect(warningsOf(r)).toHaveLength(0);
    expect(r.diagnostics.filter((d) => d.code === "duplicate-node-id-parent")).toHaveLength(1);
    expect(r.value.nodePathIndex.get("X")).toEqual(["Shop", "X"]);
  });
});
