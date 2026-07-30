// fmt round-trip for the `facet` construct (#2065 Part B slice 1).
//
// The top-level declaration block is already covered by the exhaustiveness
// guard in `formatter-top-level-coverage.test.ts`, which derives its fixture set
// from `KrsFile`'s array-valued keys. The **per-node `facets` property** is not:
// that guard cannot see nested constructs, which is exactly how #2036's scoped
// `boundary` got dropped by `fmt` unnoticed. TPL-20260510-02 therefore asks for
// a dedicated per-node round-trip test, and this is it.

import { describe, expect, it } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";

function stripLocations<T>(node: T): T {
  if (Array.isArray(node)) return node.map((item) => stripLocations(item)) as unknown as T;
  if (node instanceof Set) return new Set([...node].map((v) => stripLocations(v))) as unknown as T;
  if (node instanceof Map) {
    return new Map([...node.entries()].map(([k, v]) => [k, stripLocations(v)])) as unknown as T;
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "loc") continue;
      out[key] = stripLocations(value);
    }
    return out as T;
  }
  return node;
}

/** parse(format(x)) ≡ parse(x), and format is idempotent at the text level. */
function expectRoundTrip(src: string): string {
  const before = Parser.parse(src);
  expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  const formatted = format(src);
  const after = Parser.parse(formatted);
  expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(stripLocations(after.value)).toEqual(stripLocations(before.value));
  expect(format(formatted)).toBe(formatted);
  return formatted;
}

describe("facet fmt round-trip (TPL-20260510-02)", () => {
  it("preserves the `facets` property on a nested node", () => {
    const out = expectRoundTrip(`facet pii {}
facet pci {}

system Shop {
  service Checkout {
    domain Ordering {
      entity Order {
        table OrderDB.orders
        facets pii, pci
      }
    }
  }
}
`);
    expect(out).toContain("facets pii, pci");
  });

  it("preserves `facets` on every node kind it is accepted on", () => {
    const out = expectRoundTrip(`facet a {}

system S {
  facets a

  user U {
    facets a
  }

  client C {
    facets a
  }

  service Sv {
    facets a

    domain D {
      facets a

      usecase Uc {
        facets a

        resource R {
          facets a
        }
      }

      entity E {
        facets a
      }
    }
  }

  database DB {
    facets a

    table T {
      facets a
    }
  }

  queue Q {
    facets a

    queue QI {
      facets a
    }
  }

  storage St {
    facets a

    bucket B {
      facets a
    }
  }
}
`);
    // 14 declarations carry the property; every one must survive.
    expect(out.match(/facets a/g)).toHaveLength(14);
  });

  it("canonicalizes repeated lines and duplicate ids into one comma list", () => {
    const formatted = format(`facet a {}
facet b {}
system S {
  service Checkout {
    facets a
    facets b, a
  }
}
`);
    expect(formatted).toContain("facets a, b");
    expect(formatted.match(/facets /g)).toHaveLength(1);
    // Canonical output is a fixed point, and re-parsing it yields the same set.
    expect(format(formatted)).toBe(formatted);
    expect(Parser.parse(formatted).value.systems[0].children[0].facets).toEqual(["a", "b"]);
  });

  it("keeps a node whose only content is `facets` from collapsing to `{}`", () => {
    const formatted = format(`facet a {}\nsystem S { service Checkout { facets a } }\n`);
    expect(formatted).toContain("facets a");
    expect(Parser.parse(formatted).value.systems[0].children[0].facets).toEqual(["a"]);
  });

  it("emits the declaration with `label` as a property, not positionally", () => {
    const formatted = format(`facet pii {
  label "Personal data"
  description "d"
  link "https://example.com" "policy"
}
`);
    expect(formatted).toContain('facet pii {\n  label "Personal data"');
    expect(format(formatted)).toBe(formatted);
  });

  it("preserves declaration order when a facet is interleaved with other top-level blocks", () => {
    const out = expectRoundTrip(`database DB {
  label "DB"
}

facet pii {
  label "Personal data"
}

system S {
  service A {
    label "A"
  }
}
`);
    const order = ["database DB", "facet pii", "system S"].map((needle) => out.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("quotes an id that needs quoting", () => {
    const out = expectRoundTrip(`facet "pci-dss" {}

system S {
  service Checkout {
    facets "pci-dss"
  }
}
`);
    expect(out).toContain('facets "pci-dss"');
  });
});
