/**
 * Meta-test enforcing TPL-510 (派生・集約で自動付与するタグは元
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
 * `buildInheritedAnnotations`, `extractTeamDependencies`,
 * `findStructuralOverlaps`). Each row declares:
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
 * (e.g. dropping `...edge` from the implicit-edge spread in `derived-edges.ts`
 * `deriveImplicitServiceEdges`) flips the corresponding row red — verified by
 * hand-rehearsing that exact regression before landing this file.
 *
 * **When you add a new derivation / aggregation / synthesis function**
 * (a new `derive*Edges`, a new `apply*Tags`, a new annotation
 * propagator, …) **add a row here**. A new derivation function that
 * silently drops a documented preservation guarantee is exactly the
 * regression family TPL-510 calls out, and a meta-table is the only
 * structural defense — individual unit tests check their own function
 * in isolation. Registering is enforced: the registry test at the end of
 * this file enumerates every exported function of the modules under
 * `view/` (and the annotation propagator) and fails on one that is neither
 * a row's subject nor listed in `NOT_A_DERIVATION` with a reason.
 *
 * Refs:
 *   - TPL-510, checklist item 1 (semantic attribute preservation)
 *   - TPL-74 (AST/parser/renderer agreement) — sibling curated-table meta
 *   - #1233 (G12-1) / #1241 (GA08-2) / #1247 (GR06-2) — sibling gaps
 *   - #510 — the originating TPL-510 bug (sync/async collapse in implicit edges)
 */
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "./view-extract.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { extractTeamDependencies } from "./team-dependency-extract.js";
import {
  extractEntityView,
  projectStoreRelations,
  unionProjectedRelations,
} from "./entity-relations.js";
import type { KrsEdge } from "../types/ast.js";

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
    name: "extractTeamDependencies: cross-service domain edge (async) aggregated to a team pair",
    preserves: {
      // The distinction #510 was originally about, in its organizational
      // projection: an async dependency is deliberate loose coupling and a
      // weaker coordination requirement, so folding it into the sync path
      // would tell two teams they are more tightly bound than they are.
      kind: "async",
      // The inducing edge stays retrievable, so a derived pair can be checked
      // against the model rather than taken on trust.
      viaLabel: "async event",
    },
    transforms: {
      // Endpoints are rewritten from node paths up to the teams that own them,
      // by way of the nearest owned ancestor.
      fromTeam: "ta",
      toTeam: "tb",
      // Whether the pair crosses the org or sits inside one team's subtree.
      relation: "cross-team",
    },
    observe: () => {
      const file = Parser.parse(`
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
organization O {
  team ta { owns ServiceA }
  team tb { owns ServiceB }
}
`).value;
      const [dep] = extractTeamDependencies(file).dependencies;
      if (!dep) throw new Error("expected a derived ta->tb dependency");
      return {
        kind: dep.kind,
        viaLabel: dep.via[0]?.label,
        fromTeam: dep.fromTeam,
        toTeam: dep.toTeam,
        relation: dep.relation,
      };
    },
  },
  {
    name: "findStructuralOverlaps: node owned across a containment boundary",
    preserves: {
      // The node's own kind survives the projection — the overlap is reported
      // about a `domain`, not about an anonymous path.
      kind: "domain",
      // The full 1:N owner list, never collapsed to a primary (TPL-2161): a
      // node handed between two teams keeps both on the inner side.
      teams: ["t2", "t3"],
    },
    transforms: {
      // A node path becomes a (path, insidePath) pair naming the containment
      // that ownership crosses.
      path: "S.A.Da",
      insidePath: "S.A",
      // And the same nested / cross-team discriminator the dependency channel
      // carries, so the two are not conflated in a count.
      relation: "cross-team",
    },
    observe: () => {
      const file = Parser.parse(`
system S {
  service A { domain Da {} }
}
organization O {
  team t1 { owns A }
  team t2 { owns Da }
  team t3 { owns Da }
}
`).value;
      const [overlap] = extractTeamDependencies(file).overlaps;
      if (!overlap) throw new Error("expected a structural overlap");
      return {
        kind: overlap.kind,
        teams: overlap.teams,
        path: overlap.path,
        insidePath: overlap.insidePath,
        relation: overlap.relation,
      };
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
  {
    name: "projectStoreRelations: entity relation projected onto the leaves of its store",
    preserves: {
      // The relation's arrow and label are what the store canvas has to say
      // about it; a projected `-->` that turned solid would claim the store
      // enforces a reference it does not.
      kind: "async",
      label: "placed by",
    },
    transforms: {
      // Endpoints move from the entities to the tables they map to.
      from: "orders",
      to: "customers",
      // The relation's own tags stay, `[projected]` marks the origin.
      tags: ["inferred", "projected"],
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  service Svc {
    domain Ordering {
      entity Order {
        table DB.orders
        Order --> Customer "placed by" [inferred]
      }
      entity Customer { table DB.customers }
    }
  }
  database DB { table orders {} table customers {} }
}
`).value.systems;
      const store = systems[0].children.find((c) => c.id === "DB");
      if (!store) throw new Error("expected the DB store");
      const [edge] = projectStoreRelations(store, systems);
      if (!edge) throw new Error("expected a projected orders->customers edge");
      return {
        kind: edge.kind,
        label: edge.label,
        from: edge.from,
        to: edge.to,
        tags: edge.tags,
      };
    },
  },
  {
    name: "unionProjectedRelations: a recorded edge absorbs the projection on its pair",
    preserves: {
      // The record is the confirmed side: its arrow and its tags survive, so
      // the edge does not read as `[projected]` once the store records it.
      kind: "sync",
      tags: [],
    },
    transforms: {
      // Only a label the record lacks is taken from the relation.
      label: "placed by",
      count: 1,
    },
    observe: () => {
      const loc = {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      };
      const recorded: KrsEdge = {
        from: "orders",
        to: "customers",
        kind: "sync",
        tags: [],
        loc,
      };
      const projected: KrsEdge = {
        from: "orders",
        to: "customers",
        kind: "async",
        label: "placed by",
        tags: ["projected"],
        loc,
      };
      const edges = unionProjectedRelations([recorded], [projected]);
      return {
        kind: edges[0].kind,
        tags: edges[0].tags,
        label: edges[0].label,
        count: edges.length,
      };
    },
  },
  {
    name: "synthesizeGhosts: a caller in another system drawn as a ghost on the service canvas",
    preserves: {
      kind: "async",
      label: "charges",
      tags: ["audited"],
    },
    transforms: {
      // The caller is qualified with its system so layout finds the ghost card,
      // and the target becomes the container the canvas is drawn for.
      from: "Shop.Checkout",
      to: "Payments",
    },
    observe: () => {
      const systems = Parser.parse(`
system Shop {
  service Checkout {}
  Checkout --> Billing.Payments "charges" [audited]
}
system Billing {
  service Payments {}
}
`).value.systems;
      const view = extractView(systems, ["Billing", "Payments"]);
      const [edge] = view.callerGhostSystemEdges;
      if (!edge) throw new Error("expected a caller ghost edge into Payments");
      return {
        kind: edge.kind,
        label: edge.label,
        tags: edge.tags,
        from: edge.from,
        to: edge.to,
      };
    },
  },
  {
    name: "collectPromotedChildren: usecase -> resource edge synthesized from operations",
    // Purely synthesized from the resource declaration: there is no source
    // edge, so every observable attribute is a transform.
    preserves: {},
    transforms: {
      from: "PlaceOrder",
      to: "OrderDB.OrderTable",
      kind: "sync",
      // `operations create, read` writes, so the edge carries the write marker
      // style rules key off, and its label says so.
      tags: ["write"],
      label: "W",
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
        resource OrderDB.OrderTable {
          operations create, read
        }
      }
    }
  }
}
`).value.systems;
      const view = extractView(systems, ["S", "OrderService", "Order"]);
      const edge = view.childEdges.find(
        (e) => e.from === "PlaceOrder" && e.to === "OrderDB.OrderTable",
      );
      if (!edge) throw new Error("expected a synthesized PlaceOrder->OrderDB.OrderTable edge");
      return {
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        tags: edge.tags,
        label: edge.label,
      };
    },
  },
  {
    name: "extractEntityView: relation into another domain drawn to a ghost entity",
    preserves: {
      kind: "async",
      label: "billed to",
      tags: ["inferred"],
    },
    transforms: {
      // The target becomes the ghost card's key, qualified by its domain.
      from: "Order",
      to: "Billing.Account",
    },
    observe: () => {
      const systems = Parser.parse(`
system S {
  service Svc {
    domain Ordering {
      entity Order {
        Order --> Billing.Account "billed to" [inferred]
      }
    }
    domain Billing {
      entity Account {}
    }
  }
}
`).value.systems;
      const view = extractEntityView(systems, ["S", "Svc", "Ordering"]);
      const [edge] = view.ghostEntityEdges;
      if (!edge) throw new Error("expected a ghost entity edge into Billing.Account");
      return {
        kind: edge.kind,
        label: edge.label,
        tags: edge.tags,
        from: edge.from,
        to: edge.to,
      };
    },
  },
];

describe("meta: every derivation path preserves and transforms documented attributes (TPL-510)", () => {
  it.each(DERIVATION_CONTRACTS)("$name", (row) => {
    const observed = row.observe();
    const expected = { ...row.preserves, ...row.transforms };
    expect(observed).toMatchObject(expected);
  });
});

// ─── Registry: every exported function is a row's subject or exempt ─────────

/**
 * Exported functions of the scanned modules that are not derivations, each
 * with the reason. A row's subject is the text of its `name` before the first
 * `:`. A new export in a scanned module fails the registry test until it is
 * either the subject of a row above or listed here, so a new `derive*` /
 * `synthesize*` / `apply*` function cannot land without someone deciding
 * whether it carries semantic attributes through. Whether a row lists the
 * right attributes stays with review.
 */
const NOT_A_DERIVATION: Record<string, string> = {
  // anchored-edges.ts
  nodeId: "reads a node's id; no output edge or node",
  drawnEdgeKey: "a map key for an edge; no output edge",
  isAnchoredAt: "a predicate",
  collectAnchoredPeerEdges:
    "returns the authored edges whose endpoints are peers, unchanged (same objects)",
  withChildAnchoredEdges: "concatenates a block's authored edges with its children's, unchanged",
  containerCanvasEdges: "selects a container's authored edges, unchanged",
  // coverage-extract.ts
  extractCoverage: "a report of which nodes are mapped; draws nothing",
  // crud-matrix-extract.ts / crud-matrix-format.ts
  cellKey: "a map key",
  extractCrudMatrix: "a usecase x resource table; no edge or node is drawn from it",
  formatCell: "formats a table cell",
  formatMatrixAsMarkdown: "serializes the CRUD matrix",
  formatMatrixAsCsv: "serializes the CRUD matrix",
  // deploy-view-extract.ts
  extractDeployView:
    "synthesizes ghost edges: re-endpoints `system.edges` and deriveInfraEdges' output onto " +
    "deploy containers, keeps `label` and `kind`, drops tags and annotations, and dedupes by " +
    "`from`/`to` alone, so a sync and an async edge between the same containers collapse into " +
    "whichever came first. Not a row because neither distinction TPL-510 guards (`kind`, tags) " +
    "reaches the deploy view: layoutDeploy hands the renderer only `from`, `to` and `label` " +
    "(`label` passes through as authored), so every ghost edge is drawn in one style and the " +
    "kept `kind` reaches no style rule. Once the deploy " +
    "view styles ghost edges by `kind` or tags, this needs a row and a dedupe key with `kind`",
  // derived-edges.ts
  buildDomainServiceMap: "an index from domain to owning service",
  deriveCanvasEdges:
    "composes deriveInfraEdges, deriveImplicitServiceEdges and deriveDeliversEdges (each a row) with authored edges; sets no attribute itself",
  // edge-key.ts
  edgeKey: "a map key",
  edgeKindKey: "a map key",
  // ghost-synthesis.ts
  emptyGhostSynthesis: "the empty result",
  // org-view-extract.ts
  extractOrgView: "slices teams and members as authored",
  // resource-promotion.ts
  buildResourceInferredTagsMap: "the index applyInferredTags reads (applyInferredTags is a row)",
  buildResourceLabelMap: "an index from resource id to its label",
  // team-dependency-format.ts
  formatTeamDependenciesAsMarkdown: "serializes extractTeamDependencies (a row)",
  formatTeamDependenciesAsCsv: "serializes extractTeamDependencies (a row)",
  // unassigned-system.ts
  synthesizeUnassignedSystem:
    "wraps top-level orphans in a pseudo-system; the nodes and edges inside are the authored ones",
  withoutUnassignedSegment: "strips the pseudo-system's id from a path",
  withUnassignedSystem: "adds synthesizeUnassignedSystem's pseudo-system to the system list",
  isUnassignedSystem: "a predicate",
  // view-extract.ts / view-path.ts / view-slice.ts
  createViewExtractor: "a memoizing wrapper around extractView",
  extractView: "dispatches to the derivations above; each derived family has its own row",
  resolveContainerChain: "resolves a view path to nodes",
  emptySlice: "the empty slice",
  physicalTargetsOf:
    "re-exported index of what a `<Parent>.<Child>` can name (#3794); builds no node or edge",
};

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every module under `view/`, plus the annotation propagator that lives in `resolver/`. */
const SCANNED_MODULES = [
  ...readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort()
    .map((f) => `./${f.replace(/\.ts$/, ".js")}`),
  "../resolver/inherited-annotations.js",
];

describe("meta: every exported function of the derivation modules is classified (TPL-510)", () => {
  const exported = new Map<string, string>();
  const duplicates: string[] = [];
  beforeAll(async () => {
    for (const path of SCANNED_MODULES) {
      const mod = (await import(path)) as Record<string, unknown>;
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value !== "function") continue;
        const first = exported.get(name);
        if (first !== undefined) duplicates.push(`${name}: ${first} and ${path}`);
        else exported.set(name, path);
      }
    }
  });

  const subjects = new Set(DERIVATION_CONTRACTS.map((row) => row.name.split(":")[0].trim()));

  it("scans the modules that hold the derivations", () => {
    // Guard against the scan silently matching nothing.
    const expected = [
      "deriveImplicitServiceEdges",
      "synthesizeGhosts",
      "buildInheritedAnnotations",
    ];
    expect(expected.filter((name) => !exported.has(name))).toEqual([]);
  });

  it("no two scanned modules export a function under the same name", () => {
    // Rows and exemptions name a function by its export name alone, so a second
    // module exporting the same name would ride on the first one's entry.
    expect(duplicates).toEqual([]);
  });

  it("every exported function is the subject of a row or named as not a derivation", () => {
    const unclassified = [...exported]
      .filter(([name]) => !subjects.has(name) && !(name in NOT_A_DERIVATION))
      .map(([name, path]) => `${path}: ${name}`);
    // Add a DERIVATION_CONTRACTS row whose name starts with `<function>:`, or
    // an entry in NOT_A_DERIVATION saying why the function derives nothing.
    expect(unclassified).toEqual([]);
  });

  it("names no function that is gone or that also has a row", () => {
    const stale = Object.keys(NOT_A_DERIVATION).filter(
      (name) => !exported.has(name) || subjects.has(name),
    );
    expect(stale).toEqual([]);
  });
});
