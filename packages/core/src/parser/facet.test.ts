// The `facet` construct (#2065 Part B slice 1): the top-level declaration
// block, the element-side `facets` property, and the 1:N `facetIndex` they
// build.
//
// Two properties carry most of the design and are pinned hardest here:
//
//   1. The declaration grammar is CLOSED and value-free — `label` /
//      `description` / `link` only. That is not a convenience limit, it is the
//      structural half of ADR-832's refusal to model runtime authorization, so
//      `contains` and anything predicate-shaped must stay rejected.
//   2. Membership is 1:N and the index keeps every declared membership
//      (TPL-2161). The `boundaryIndex` next door is 1:1 first-wins; this
//      file exists partly so that shape cannot be copied here unnoticed.

import { describe, expect, it } from "vitest";
import { Parser } from "./parser.js";
import type { KrsFile, KrsNode } from "../types/ast.js";

function parse(src: string): KrsFile {
  const result = Parser.parse(src);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return result.value;
}

function errors(src: string): string[] {
  return Parser.parse(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
}

describe("facet declaration block", () => {
  it("parses id + label / description / link", () => {
    const file = parse(`
facet pii {
  label "Personal data"
  description "Handling follows ADR-1421"
  link "https://example.com/adr/1421" "ADR-1421"
}
`);
    expect(file.facets).toHaveLength(1);
    const facet = file.facets[0];
    expect(facet.kind).toBe("facet");
    expect(facet.id).toBe("pii");
    expect(facet.label).toBe("Personal data");
    expect(facet.properties.description).toBe("Handling follows ADR-1421");
    expect(facet.properties.links).toEqual([
      expect.objectContaining({ url: "https://example.com/adr/1421", label: "ADR-1421" }),
    ]);
  });

  it("parses with no properties at all", () => {
    const file = parse(`facet pii {}`);
    expect(file.facets[0].id).toBe("pii");
    expect(file.facets[0].label).toBeUndefined();
  });

  // ADR-832's fence, in test form. A membership list or any predicate-shaped
  // property would reopen the path from "declare a scope" to "declare a rule",
  // so these must not quietly become valid.
  it("rejects `contains` — the declaration has no membership list", () => {
    // One diagnostic for one mistake: the rejected forms carry values
    // (`contains Order`), and reporting every token of the clause separately
    // would read as a broken parser rather than a rejected construct.
    expect(errors(`facet pii { contains Order }`)).toEqual(["unexpected-token-in-block"]);
  });

  it("rejects an unknown property", () => {
    expect(errors(`facet pii { requires plan }`)).toEqual(["unexpected-token-in-block"]);
  });

  it("reports a rejected run once, names its first token, and keeps the valid properties", () => {
    const result = Parser.parse(`facet pii {
  label "Personal data"
  contains Order
  requires plan in [pro, enterprise]
  description "d"
}`);
    // Recovery skips to the next legal property, so an unbroken run of rejected
    // content is one report naming where it starts — not one per token, and not
    // one per line.
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "unexpected-token-in-block",
      params: { blockKind: "facet", value: "contains" },
    });
    // Everything on either side of the rejected run still parsed.
    expect(result.value.facets[0].label).toBe("Personal data");
    expect(result.value.facets[0].properties.description).toBe("d");
  });

  it("rejects a positional label (ADR-19)", () => {
    expect(errors(`facet pii "Personal data" {}`)).toContain("positional-label-removed");
  });

  it("recovers from a nested declaration with one diagnostic, not a cascade", () => {
    const result = Parser.parse(`
system Shop {
  facet pii {
    label "Personal data"
    description "d"
  }
  service Checkout {}
}
`);
    const errs = result.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["unexpected-token-in-block"]);
    // The block was consumed whole, so the sibling after it still parsed.
    expect(result.value.systems[0].children.map((c) => c.id)).toEqual(["Checkout"]);
    // …and it did not leak into the top-level declaration list.
    expect(result.value.facets).toEqual([]);
  });

  it("reports a misplaced block once even when its body is also malformed", () => {
    // The mistake is the placement; complaints about the body of a block that
    // should not be here at all point at the wrong fix.
    const result = Parser.parse(`
system Shop {
  facet pii {
    contains Order
    requires plan
  }
  service Checkout {}
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["unexpected-token-in-block"]);
    expect(result.value.systems[0].children.map((c) => c.id)).toEqual(["Checkout"]);
  });

  it("reports a re-declared id as duplicate-facet-id and keeps the first", () => {
    const result = Parser.parse(`
facet pii { label "First" }
facet pii { label "Second" }
`);
    const dupes = result.diagnostics.filter((d) => d.code === "duplicate-facet-id");
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe("error");
    expect(dupes[0].params).toEqual({ facetId: "pii" });
    // Both blocks survive in the AST — `fmt` must not delete the author's text
    // over a diagnostic — but the first is the addressable one.
    expect(result.value.facets.map((f) => f.label)).toEqual(["First", "Second"]);
  });

  it("does not report distinct ids", () => {
    const result = Parser.parse(`facet pii {}\nfacet pci {}`);
    expect(result.diagnostics.filter((d) => d.code === "duplicate-facet-id")).toEqual([]);
  });
});

describe("facets property", () => {
  it("accepts a comma list", () => {
    const file = parse(`
facet pii {}
facet pci {}
system Shop {
  service Checkout {
    facets pii, pci
  }
}
`);
    expect(file.systems[0].children[0].facets).toEqual(["pii", "pci"]);
  });

  it("merges repeated `facets` lines", () => {
    const file = parse(`
facet a {}
facet b {}
system Shop {
  service Checkout {
    facets a
    facets b
  }
}
`);
    expect(file.systems[0].children[0].facets).toEqual(["a", "b"]);
  });

  it("collapses a duplicate id idempotently, without a diagnostic", () => {
    const result = Parser.parse(`
facet a {}
system Shop {
  service Checkout {
    facets a, a
    facets a
  }
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.value.systems[0].children[0].facets).toEqual(["a"]);
  });

  it("is omitted from the node when never written", () => {
    const file = parse(`system Shop { service Checkout {} }`);
    expect(file.systems[0].children[0].facets).toBeUndefined();
    expect("facets" in file.systems[0].children[0]).toBe(false);
  });

  it("reports a missing id without swallowing the next line", () => {
    const result = Parser.parse(`
facet a {}
system Shop {
  service Checkout {
    facets
    label "Checkout"
  }
}
`);
    expect(result.diagnostics.map((d) => d.code)).toContain("expected-id-after");
    expect(result.value.systems[0].children[0].label).toBe("Checkout");
  });

  it("accepts a quoted id", () => {
    const file = parse(`
facet "pci-dss" {}
system Shop { service Checkout { facets "pci-dss" } }
`);
    expect(file.systems[0].children[0].facets).toEqual(["pci-dss"]);
  });
});

// `facets` is accepted on every node kind because membership is imposed from
// outside the architecture — no kind is structurally excluded. The per-kind
// probe in `base-node-fields-coverage.test.ts` covers the same ground field by
// field; this one states the intent in one place and covers the deep infra
// leaves that are easiest to forget.
describe("facets is accepted on every node kind", () => {
  const SOURCES: Record<string, { src: string; pick: (f: KrsFile) => KrsNode }> = {
    system: { src: `system S { facets a }`, pick: (f) => f.systems[0] },
    service: { src: `service Sv { facets a }`, pick: (f) => f.services[0] },
    client: { src: `client C { facets a }`, pick: (f) => f.clients[0] },
    domain: { src: `domain D { facets a }`, pick: (f) => f.domains[0] },
    usecase: {
      src: `domain D { usecase U { facets a } }`,
      pick: (f) => f.domains[0].children[0],
    },
    entity: {
      src: `domain D { entity E { facets a } }`,
      pick: (f) => f.domains[0].children[0],
    },
    resource: {
      src: `domain D { usecase U { resource R { facets a } } }`,
      pick: (f) => f.domains[0].children[0].children[0],
    },
    user: {
      src: `system S { user U { facets a } }`,
      pick: (f) => f.systems[0].children[0],
    },
    database: { src: `database DB { facets a }`, pick: (f) => f.databases[0] },
    queue: { src: `queue Q { facets a }`, pick: (f) => f.queues[0] },
    storage: { src: `storage St { facets a }`, pick: (f) => f.storages[0] },
    table: {
      src: `database DB { table T { facets a } }`,
      pick: (f) => f.databases[0].children[0],
    },
    "queue-item": {
      src: `queue Q { queue QI { facets a } }`,
      pick: (f) => f.queues[0].children[0],
    },
    bucket: {
      src: `storage St { bucket B { facets a } }`,
      pick: (f) => f.storages[0].children[0],
    },
  };

  for (const [kind, { src, pick }] of Object.entries(SOURCES)) {
    it(`accepts \`facets\` on ${kind}`, () => {
      const file = parse(`facet a {}\n${src}`);
      expect(pick(file).facets).toEqual(["a"]);
    });
  }
});

describe("facetIndex", () => {
  it("is 1:N — a node in two facets keeps both", () => {
    const file = parse(`
facet pii {}
facet pci {}
system Shop {
  service Checkout {
    facets pii, pci
  }
}
`);
    expect(file.facetIndex.get("Checkout")).toEqual(new Set(["pii", "pci"]));
  });

  it("does not report multi-membership as a diagnostic", () => {
    const result = Parser.parse(`
facet pii {}
facet pci {}
system Shop { service Checkout { facets pii, pci } }
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("indexes nodes at every depth, including infra leaves", () => {
    const file = parse(`
facet pii {}
system Shop {
  service Checkout {
    domain Ordering {
      entity Order { facets pii }
    }
  }
  database OrderDB {
    facets pii
    table orders { facets pii }
  }
}
`);
    expect([...file.facetIndex.keys()].sort()).toEqual(["Order", "OrderDB", "orders"]);
  });

  // Top-level (system-less) declarations are a first-class layout, and a walk
  // that only descends from `systems` would quietly skip them (TPL-1160).
  it("indexes top-level orphan nodes and their descendants", () => {
    const file = parse(`
facet a {}
service Sv { facets a }
domain D { usecase U { facets a } }
database DB { table T { facets a } }
client C { facets a }
`);
    expect([...file.facetIndex.keys()].sort()).toEqual(["C", "Sv", "T", "U"]);
  });

  it("omits nodes with no facets rather than storing empty sets", () => {
    const file = parse(`facet a {}\nsystem Shop { service Checkout {} }`);
    expect(file.facetIndex.size).toBe(0);
  });
});

// The index key is the bare node id (the flat `ownerIndex` / `boundaryIndex`
// convention), and ids are unique only among siblings. This pins the resulting
// ambiguity as *known and bounded* rather than leaving it to be discovered by
// the overlay slice: memberships union, and the reference check stays correct
// (TPL-1352 — a key must carry every distinguishing dimension; resolving node
// identity is the overlay's job, not this index's).
describe("facetIndex — same-id nodes in different scopes", () => {
  it("unions the memberships of same-id nodes rather than dropping one", () => {
    const file = parse(`
facet pii {}
facet pci {}
system Shop {
  service Payment {
    domain Ledger { facets pii }
  }
  service Checkout {
    domain Payment { facets pci }
  }
}
`);
    // "Payment" names both a service and a nested domain; the flat key merges
    // them. Nothing is lost — which is the property that matters for slice 1.
    expect(file.facetIndex.get("Payment")).toEqual(new Set(["pci"]));
    expect(file.facetIndex.get("Ledger")).toEqual(new Set(["pii"]));
  });

  it("keeps the reference check correct despite the shared key", () => {
    const result = Parser.parse(`
facet pii {}
system Shop {
  service Payment { domain Ledger { facets pii } }
  service Checkout { domain Payment {} }
}
`);
    // The undeclared-facet check reads declared references only, so a node that
    // declares nothing cannot inherit a warning from its same-named twin.
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
