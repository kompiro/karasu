/**
 * Meta-test enforcing TPL-20260510-07 (派生・集約で自動付与するタグは元
 * ノードの semantic 区別を保存する) — checklist item 1: every derivation
 * path must enumerate which source attributes it preserves and which it
 * transforms, so a future refactor cannot silently drop a preserved one.
 *
 * Issue #1249 / coverage gap GE07-2. This is the **4th instance** of the
 * curated-table meta-pattern (after #1233 / #1241 / #1247) — see
 * `docs/test-perspectives/README.md` 「繰り返し現れる対処パターン」.
 *
 * Mechanism: a curated `DERIVATION_CONTRACTS` table where each row pins
 * down one derivation function (`deriveImplicitServiceEdges`,
 * `deriveInfraEdges`, `deriveDeliversEdges`, `applyInferredTags`,
 * `buildInheritedAnnotations`). Each row declares:
 *
 *   - `preserves`: source attributes the derivation must carry through
 *     unchanged (e.g. `kind` for implicit service edges, since #510).
 *   - `transforms`: attributes the derivation must set to a documented
 *     value (e.g. `tags: ["implicit"]`).
 *   - `observe`: a thunk that constructs a fixture exercising every
 *     `preserves` and `transforms` key, runs the derivation through the
 *     public API (`extractView` / `buildInheritedAnnotations`), and
 *     returns the observed attributes as a flat record.
 *
 * The test asserts the observed record matches the union of `preserves`
 * and `transforms`. Removing a preserved attribute from any derivation
 * (e.g. dropping `...edge` from the implicit-edge spread at
 * `view-extract.ts:158`) flips the corresponding row red — verified by
 * hand-rehearsing that exact regression before landing this file.
 *
 * **When you add a new derivation / aggregation / synthesis function**
 * (a new `derive*Edges`, a new `apply*Tags`, a new annotation
 * propagator, …) **add a row here**. A new derivation function that
 * silently drops a documented preservation guarantee is exactly the
 * regression family TPL-07 calls out, and a meta-table is the only
 * structural defense — individual unit tests check their own function
 * in isolation. Failing to register a new entry slips past this test;
 * code review of the new function should surface the omission, since
 * the convention is documented here.
 *
 * Refs:
 *   - TPL-20260510-07, checklist item 1 (semantic attribute preservation)
 *   - TPL-20260510-12 (AST/parser/renderer agreement) — sibling curated-table meta
 *   - #1233 (G12-1) / #1241 (GA08-2) / #1247 (GR06-2) — sibling gaps
 *   - #510 — the originating TPL-07 bug (sync/async collapse in implicit edges)
 */
import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "./view-extract.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";

interface DerivationContract {
  /** Function name + short qualifier, used by `it.each` `$name`. */
  name: string;
  /**
   * Attributes the derivation must carry through from a source element
   * unchanged. Failing to preserve any of these means the derivation
   * has lost a semantic distinction the rest of the pipeline relies on.
   */
  preserves: Record<string, unknown>;
  /**
   * Attributes the derivation must set to a documented value. These are
   * the synthesized / rewritten parts of the output; the rest of the
   * pipeline assumes the exact shape recorded here.
   */
  transforms: Record<string, unknown>;
  /**
   * Construct a fixture that exercises every `preserves` and `transforms`
   * key, run the derivation, and return the observed attributes as a
   * flat record. Keep this self-contained — the goal is one row per
   * derivation function, not one row per fixture variation.
   */
  observe: () => Record<string, unknown>;
}

const DERIVATION_CONTRACTS: DerivationContract[] = [
  {
    name: "deriveImplicitServiceEdges: cross-service domain edge (async)",
    preserves: {
      // `kind` is the canonical preserved attribute (#510 root cause):
      // dropping it merges sync and async into one indistinguishable edge.
      kind: "async",
      // Single-source label flows through unchanged. Aggregated pairs
      // get a `"N domain edges"` label instead — covered by view-extract.test.ts.
      label: "async event",
    },
    transforms: {
      // `from` / `to` are rewritten from domain ids up to service ids.
      from: "ServiceA",
      to: "ServiceB",
      // `[implicit]` is the derivation-origin marker style rules key off.
      tags: ["implicit"],
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  service ServiceA {
    domain DomainA {
      DomainA --> DomainB "async event"
    }
  }
  service ServiceB {
    domain DomainB {}
  }
}
`).value.systems;
      const view = extractView(systems, []);
      const edge = view.childEdges.find(
        (e) => e.from === "ServiceA" && e.to === "ServiceB" && e.tags.includes("implicit"),
      );
      if (!edge) throw new Error("expected implicit ServiceA->ServiceB edge");
      return { kind: edge.kind, label: edge.label, from: edge.from, to: edge.to, tags: edge.tags };
    },
  },
  {
    name: "deriveInfraEdges: service→database via resource dot-notation",
    // Infra edges are purely synthesized — there is no source edge to
    // preserve attributes from. Every observable attribute is a transform.
    preserves: {},
    transforms: {
      from: "OrderService",
      to: "OrderDB",
      kind: "sync",
      tags: [],
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  database OrderDB {
    table OrderTable {}
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
`).value.systems;
      const view = extractView(systems, []);
      const edge = view.childEdges.find((e) => e.from === "OrderService" && e.to === "OrderDB");
      if (!edge) throw new Error("expected synthesized OrderService->OrderDB infra edge");
      return { from: edge.from, to: edge.to, kind: edge.kind, tags: edge.tags };
    },
  },
  {
    name: "deriveDeliversEdges: service `delivers` → client",
    // Same as infra edges — `delivers` synthesizes a fresh edge from a
    // property, not from an existing edge.
    preserves: {},
    transforms: {
      from: "NextServer",
      to: "WebApp",
      kind: "sync",
      // `[delivers]` lets the stylesheet render delivers distinctly from
      // regular communication edges.
      tags: ["delivers"],
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  service NextServer {
    delivers WebApp
  }
  client WebApp [web]
}
`).value.systems;
      const view = extractView(systems, []);
      const edge = view.childEdges.find((e) => e.tags.includes("delivers"));
      if (!edge) throw new Error("expected delivers edge");
      return { from: edge.from, to: edge.to, kind: edge.kind, tags: edge.tags };
    },
  },
  {
    name: "applyInferredTags: resource with dot-ref + empty tags gains inferred tag",
    preserves: {
      // `id` and `kind` are the identity-bearing attributes — applying
      // an inferred tag must not rename or retype the node.
      id: "OrderDB.OrderTable",
      kind: "resource",
    },
    transforms: {
      tags: ["table"],
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  database OrderDB {
    table OrderTable {}
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
`).value.systems;
      const view = extractView(systems, ["S", "OrderService", "Order"]);
      const node = view.childNodes.find((n) => n.id === "OrderDB.OrderTable");
      if (!node) throw new Error("expected promoted OrderDB.OrderTable resource node");
      return { id: node.id, kind: node.kind, tags: node.tags };
    },
  },
  {
    name: "applyInferredTags: explicit tags on resource are preserved (not overwritten)",
    preserves: {
      id: "OrderDB.OrderTable",
      kind: "resource",
      // Explicit tags must survive — the inferred-tag step must NOT
      // overwrite a tag set the author wrote in source.
      tags: ["external"],
    },
    transforms: {},
    observe: () => {
      const systems = Parser.parse(`
system S {
  database OrderDB {
    table OrderTable {}
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable [external]
      }
    }
  }
}
`).value.systems;
      const view = extractView(systems, ["S", "OrderService", "Order"]);
      const node = view.childNodes.find((n) => n.id === "OrderDB.OrderTable");
      if (!node) throw new Error("expected promoted OrderDB.OrderTable resource node");
      return { id: node.id, kind: node.kind, tags: node.tags };
    },
  },
  {
    name: "buildInheritedAnnotations: descendant with empty annotations inherits service's",
    // The output of this derivation is a (node id → annotations) map
    // entry. The "preserved" attribute is the source service's
    // annotation list — it must reach the descendant verbatim.
    preserves: {
      annotations: ["deprecated"],
    },
    transforms: {},
    observe: () => {
      const systems = Parser.parse(`
system S {
  service Legacy @deprecated {
    domain Order {}
  }
}
`).value.systems;
      const map = buildInheritedAnnotations(systems);
      const annotations = map.get("Order");
      if (!annotations) throw new Error("expected inherited annotations for Order");
      return { annotations };
    },
  },
  {
    name: "buildInheritedAnnotations: descendant with own annotations stops inheritance",
    preserves: {
      // The map must NOT record an entry — the descendant keeps its own
      // annotations on the source node, and the resolver falls back to
      // `node.annotations` for nodes absent from the map.
      hasMapEntry: false,
    },
    transforms: {},
    observe: () => {
      const systems = Parser.parse(`
system S {
  service Legacy @deprecated {
    domain Order @migration_target {}
  }
}
`).value.systems;
      const map = buildInheritedAnnotations(systems);
      return { hasMapEntry: map.has("Order") };
    },
  },
];

describe("meta: every derivation path preserves and transforms documented attributes (TPL-20260510-07)", () => {
  it.each(DERIVATION_CONTRACTS)("$name", (row) => {
    const observed = row.observe();
    const expected = { ...row.preserves, ...row.transforms };
    expect(observed).toMatchObject(expected);
  });
});
