import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";
import { boundaryScopeKey, type KrsNode } from "../types/ast.js";

// Round-trip guard for `boundary` blocks declared inside a node block (#2036).
//
// The top-level form already has a guard (`formatter-top-level-coverage.test.ts`,
// ADR-2076), but that one derives its expectations from `KrsFile`'s array-valued
// keys and therefore cannot see a construct that hangs off a *node*. Scoped
// boundaries are exactly that, so without this file `fmt` could go back to
// silently deleting them — the failure TPL-1101 exists to prevent.

/** Membership of every scope, flattened, so two parses can be compared directly. */
function membership(source: string): Record<string, Record<string, string>> {
  const { value } = Parser.parse(source);
  const out: Record<string, Record<string, string>> = {};
  for (const [scope, map] of value.scopedBoundaryIndex) {
    out[scope] = Object.fromEntries(map);
  }
  return out;
}

function boundariesOf(node: KrsNode | undefined): string[] {
  return (node?.boundaries ?? []).map((b) => b.id);
}

describe("scoped boundary — formatter round trip", () => {
  it("keeps a nested boundary block instead of dropping it", () => {
    const source = `system Shop {
  service Checkout {
    boundary core {
      label "Core domains"
      contains Ledger
    }

    domain Ledger {}
  }
}
`;
    const formatted = format(source);
    expect(formatted).toContain("boundary core");
    expect(formatted).toContain("contains Ledger");
    expect(membership(formatted)).toEqual(membership(source));
  });

  it("is idempotent", () => {
    const source = `system Shop {
  service Checkout {
    boundary core {
      label "Core domains"
      contains Ledger
    }

    domain Ledger {}
  }
}
`;
    const once = format(source);
    expect(format(once)).toBe(once);
  });

  it("preserves a description inside a scoped boundary", () => {
    const source = `system Shop {
  service Checkout {
    boundary core {
      description "The domains Checkout owns outright"
      contains Ledger
    }

    domain Ledger {}
  }
}
`;
    const formatted = format(source);
    const reparsed = Parser.parse(formatted).value;
    const checkout = reparsed.systems[0].children.find((n) => n.id === "Checkout");
    expect(boundariesOf(checkout)).toEqual(["core"]);
    expect(checkout?.boundaries?.[0].properties.description).toBe(
      "The domains Checkout owns outright",
    );
  });

  it("keeps boundaries in infra blocks, which take a separate parse path", () => {
    const source = `system Shop {
  database OrderDB {
    boundary hot {
      contains orders
    }

    table orders {}
  }
}
`;
    const formatted = format(source);
    expect(formatted).toContain("boundary hot");
    expect(membership(formatted)).toEqual(membership(source));
  });

  it("keeps every scope when boundaries sit at several depths", () => {
    const source = `system Shop {
  boundary top {
    contains Checkout
  }

  service Checkout {
    boundary core {
      contains Ledger
    }

    domain Ledger {}
  }
}
`;
    const formatted = format(source);
    expect(membership(formatted)).toEqual({
      [boundaryScopeKey(["Shop"])]: { Checkout: "top" },
      [boundaryScopeKey(["Shop", "Checkout"])]: { Ledger: "core" },
    });
    expect(membership(formatted)).toEqual(membership(source));
  });
});
