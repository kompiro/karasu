import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { ParseResult, KrsFile } from "../types/ast.js";

/**
 * #2550: `node-id-multiple-locations` must not depend on declaration order,
 * and the silent orders must not overwrite `nodePathIndex` (which viewPath /
 * deep permalinks resolve against). buildNodePathIndex collects candidates
 * during the walk and decides the verdict afterwards: winner =
 * @migration_target priority, ties keep the first in traversal order
 * (TPL-1583); all-domain multiplicity stays silent (`domain-dispersal`'s
 * business). Each case asserts BOTH the warning set and the index entry.
 */

const warningsOf = (r: ParseResult<KrsFile>) =>
  r.diagnostics.filter((d) => d.code === "node-id-multiple-locations");

describe("node-id-multiple-locations is order-independent (#2550)", () => {
  it("row 1: service then nested domain — warns, the first-declared service keeps the entry", () => {
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
    expect(warningsOf(r)).toHaveLength(1);
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

  it("row 4: top-level infra vs nested service — warns and the walked service wins, in both file orders", () => {
    const dbFirst = Parser.parse(`
database Payment {}
system Shop {
  service Payment {}
}
`);
    const dbLast = Parser.parse(`
system Shop {
  service Payment {}
}
database Payment {}
`);
    for (const r of [dbFirst, dbLast]) {
      expect(warningsOf(r)).toHaveLength(1);
      expect(r.value.nodePathIndex.get("Payment")).toEqual(["Shop", "Payment"]);
    }
  });

  it("row 5: the same service id in two systems warns and keeps the first (unchanged)", () => {
    const r = Parser.parse(`
system A { service Search {} }
system B { service Search {} }
`);
    expect(warningsOf(r)).toHaveLength(1);
    expect(r.value.nodePathIndex.get("Search")).toEqual(["A", "Search"]);
  });

  it("@migration_target wins the entry across kinds, and the multiplicity still warns", () => {
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
    // The non-winner (the domain) carries the warning; the entry follows the
    // priority winner even though it is declared second.
    expect(r.value.nodePathIndex.get("X")).toEqual(["Shop", "X"]);
  });

  it("a 3-way collision draws one warning per non-winner", () => {
    const r = Parser.parse(`
system Shop {
  service X {}
  service Checkout {
    domain X {}
  }
}
database X {}
`);
    expect(warningsOf(r)).toHaveLength(2);
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
