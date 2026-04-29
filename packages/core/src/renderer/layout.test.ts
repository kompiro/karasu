import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";

function parseAndExtract(krs: string, path: string[] = []) {
  const result = Parser.parse(krs);
  return extractView(result.value.systems, path);
}

describe("layout > empty view", () => {
  it("returns empty nodes and edges when view has no child nodes and no ghost users", () => {
    // Drill into a service with no children and no connected users → early return (lines 85-96)
    const slice = parseAndExtract(
      `
system S {
  service Empty {}
}
    `,
      ["Empty"],
    );
    const result = layout(slice);
    expect(result.nodes.size).toBe(0);
    expect(result.edges).toHaveLength(0);
  });

  it("produces container rects even when the view is empty", () => {
    const slice = parseAndExtract(
      `
system S {
  service Empty {}
}
    `,
      ["Empty"],
    );
    const result = layout(slice);
    // containerNode is Service (not system) + ancestorChain has S → 2 containers
    expect(result.containers.length).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("returns zero width and height when there is no container to render", () => {
    // System-level view with no children → containerNode is system kind
    // buildContainersForEmpty skips system-kind node → outermost = null → width/height = 0
    const slice = parseAndExtract(`system S {}`);
    const result = layout(slice);
    expect(result.nodes.size).toBe(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("layout > single node", () => {
  it("positions a single node within non-negative coordinates", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "Service A" }
}
    `);
    const result = layout(slice);
    expect(result.nodes.size).toBe(1);
    const node = result.nodes.get("A")!;
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
  });
});

describe("layout > cyclic edges (assignLayers fallback)", () => {
  it("assigns layer 0 to all nodes when edges form a cycle (lines 510-513)", () => {
    // A→B and B→A: both have in-degree 1, neither enters BFS queue.
    // The fallback at lines 510-513 assigns them to layer 0.
    const slice = parseAndExtract(`
system S {
  service A { label "A" }
  service B { label "B" }
  A -> B "forward"
  B -> A "backward"
}
    `);
    const result = layout(slice);
    expect(result.nodes.size).toBe(2);
    const nodeA = result.nodes.get("A")!;
    const nodeB = result.nodes.get("B")!;
    // Both are in layer 0 → same y coordinate
    expect(nodeA.y).toBe(nodeB.y);
  });
});

describe("layout > icon mode (displayMode = 'icon')", () => {
  it("uses 160×100 for nodes with a description in icon mode", () => {
    const slice = parseAndExtract(`
system S {
  service A {
    label "Service A"
    description "詳細な説明テキスト"
  }
}
    `);
    const result = layout(slice, undefined, "icon");
    const node = result.nodes.get("A")!;
    expect(node.width).toBe(160);
    expect(node.height).toBe(100);
  });

  it("uses 160×56 for nodes without a description in icon mode", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "Service A" }
}
    `);
    const result = layout(slice, undefined, "icon");
    const node = result.nodes.get("A")!;
    expect(node.width).toBe(160);
    expect(node.height).toBe(56);
  });

  // Gap tuning for icon mode (see docs/design/icon-mode-layout-tuning.md).
  // Shape uses LAYER_GAP=120 / NODE_GAP=60 / MAX_LAYER_WIDTH=1200.
  // Icon uses LAYER_GAP=80 / NODE_GAP=36 / MAX_LAYER_WIDTH=1040.
  it("uses ICON_NODE_GAP (36) between sibling nodes within the same layer", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "A" }
  service B { label "B" }
}
    `);
    const result = layout(slice, undefined, "icon");
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    // Siblings without an edge land in the same layer; centred row → gap is B.x - (A.x + A.width).
    expect(a.y).toBe(b.y);
    expect(b.x - (a.x + a.width)).toBe(36);
  });

  it("uses ICON_LAYER_GAP (80) between layers in icon mode", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "A" }
  service B { label "B" }
  A -> B "calls"
}
    `);
    const result = layout(slice, undefined, "icon");
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    // A is in layer 0, B in layer 1 (edge A → B).
    expect(b.y - (a.y + a.height)).toBe(80);
  });

  it("retains shape-mode gaps (60) when displayMode is shape", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "A" }
  service B { label "B" }
}
    `);
    const result = layout(slice, undefined, "shape");
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    expect(b.x - (a.x + a.width)).toBe(60);
  });
});

describe("layout > ownerIndex team resolution", () => {
  it("uses ownerIndex to resolve team for a service (ownerIndex?.get branch)", () => {
    const slice = parseAndExtract(`
system S {
  service A { label "Service A" }
}
    `);
    const ownerIndex = new Map([["A", "platform-team"]]);
    const result = layout(slice, ownerIndex);
    const node = result.nodes.get("A")!;
    expect(node.properties.team).toBe("platform-team");
  });

  it("falls back to node.properties.team when ownerIndex does not contain the service", () => {
    const slice = parseAndExtract(`
system S {
  service A {
    label "Service A"
    team "my-team"
  }
}
    `);
    const ownerIndex = new Map<string, string>();
    const result = layout(slice, ownerIndex);
    const node = result.nodes.get("A")!;
    expect(node.properties.team).toBe("my-team");
  });
});

describe("layout > ghost users", () => {
  it("marks ghost users with ghost=true and positions them left of the main container", () => {
    // Service-level drill-down: Customer (user) is connected to Shop at system level
    // → Customer appears as a ghost user positioned to the left of Shop's container
    const slice = parseAndExtract(
      `
system S {
  user Customer { label "顧客" }
  service Shop {
    label "ショップ"
    service Order { label "注文" }
    service Inventory { label "在庫" }
  }
  Customer -> Shop "uses"
}
    `,
      ["Shop"],
    );
    expect(slice.ghostUsers).toHaveLength(1);

    const result = layout(slice);

    const customerNode = result.nodes.get("Customer")!;
    expect(customerNode).toBeDefined();
    expect(customerNode.ghost).toBe(true);

    const mainContainer = result.containers.find((c) => !c.ghost);
    expect(mainContainer).toBeDefined();
    expect(customerNode.x + customerNode.width).toBeLessThanOrEqual(mainContainer!.x);
  });
});

describe("layout > measureNode meta row with both links and team", () => {
  it("node with both links and team is at least as wide as node with team only", () => {
    // When both link and team are present, a spacing char is added between them (line ~563)
    const sliceBoth = parseAndExtract(`
system S {
  service A {
    label "A"
    team "my-team"
    link "https://example.com" "Wiki"
  }
}
    `);
    const sliceTeamOnly = parseAndExtract(`
system S {
  service A {
    label "A"
    team "my-team"
  }
}
    `);
    const resultBoth = layout(sliceBoth);
    const resultTeam = layout(sliceTeamOnly);
    const nodeBoth = resultBoth.nodes.get("A")!;
    const nodeTeam = resultTeam.nodes.get("A")!;
    expect(nodeBoth.width).toBeGreaterThanOrEqual(nodeTeam.width);
  });
});

describe("layout > multi-system root view", () => {
  function parseAndExtractMulti(
    krs: string,
    unassignedDomains?: ReturnType<typeof Parser.parse>["value"]["domains"],
  ) {
    const result = Parser.parse(krs);
    return extractView(result.value.systems, [], unassignedDomains ?? result.value.domains);
  }

  it("lays out all systems side by side", () => {
    const slice = parseAndExtractMulti(`
system ECPlatform {
  service OrderService {}
}
system PaymentGateway {
  service PaymentService {}
}
`);
    const result = layout(slice);
    expect(result.nodes.has("OrderService")).toBe(true);
    expect(result.nodes.has("PaymentService")).toBe(true);
    expect(result.containers).toHaveLength(2);
    const ec = result.containers.find((c) => c.id === "ECPlatform")!;
    const pg = result.containers.find((c) => c.id === "PaymentGateway")!;
    expect(ec).toBeDefined();
    expect(pg).toBeDefined();
    // Systems are placed side by side: PaymentGateway starts to the right of ECPlatform
    expect(pg.x).toBeGreaterThan(ec.x + ec.width);
    // All systems in root view should be rendered as non-ghost (regression: was ghost for si > 0)
    expect(result.nodes.get("OrderService")!.ghost).toBe(false);
    expect(result.nodes.get("PaymentService")!.ghost).toBe(false);
  });

  it("includes unassigned domains in the primary system container", () => {
    const slice = parseAndExtractMulti(`
domain Logistics { label "物流" }

system ECPlatform {
  service OrderService {}
}
system PaymentGateway {
  service PaymentService {}
}
`);
    const result = layout(slice);
    // Unassigned domain should be laid out (not silently dropped)
    expect(result.nodes.has("Logistics")).toBe(true);
  });
});

describe("layout > ghost system edges", () => {
  const CROSS_SYSTEM_KRS = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
system PaymentGateway {
  service PaymentService {}
}
`;

  it("produces a ghost edge when drilling into a service with cross-system edges", () => {
    const result = Parser.parse(CROSS_SYSTEM_KRS);
    const slice = extractView(result.value.systems, ["ECPlatform", "OrderService"]);
    const layoutResult = layout(slice);

    const ghostEdges = layoutResult.edges.filter((e) => e.ghost);
    expect(ghostEdges).toHaveLength(1);
    expect(ghostEdges[0].from).toBe("OrderService");
    expect(ghostEdges[0].to).toBe("PaymentGateway.PaymentService");
  });

  it("ghost edge has valid fromPoint and toPoint coordinates", () => {
    const result = Parser.parse(CROSS_SYSTEM_KRS);
    const slice = extractView(result.value.systems, ["ECPlatform", "OrderService"]);
    const layoutResult = layout(slice);

    const ghostEdge = layoutResult.edges.find((e) => e.ghost);
    expect(ghostEdge).toBeDefined();
    // fromPoint should come from the main container (OrderService has no child nodes)
    // toPoint should be the left edge of PaymentService ghost node
    expect(ghostEdge!.fromPoint.x).toBeGreaterThan(0);
    // Ghost systems are always placed to the right of the source container
    // by layoutGhostSystem(), so toPoint.x > fromPoint.x is always true here.
    expect(ghostEdge!.toPoint.x).toBeGreaterThan(ghostEdge!.fromPoint.x);
  });
});

describe("layout > caller ghost systems", () => {
  const CROSS_SYSTEM_KRS = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
system PaymentGateway {
  service PaymentService {}
}
`;

  it("lays out caller ghost system to the left of the main container", () => {
    const result = Parser.parse(CROSS_SYSTEM_KRS);
    const slice = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);
    const layoutResult = layout(slice);
    const mainContainer = layoutResult.containers.find((c) => !c.ghost)!;
    const callerContainer = layoutResult.containers.find((c) => c.ghost && c.id === "ECPlatform")!;
    expect(callerContainer).toBeDefined();
    expect(callerContainer.x + callerContainer.width).toBeLessThan(mainContainer.x);
  });

  it("produces a ghost edge from the caller ghost service to the main container", () => {
    const result = Parser.parse(CROSS_SYSTEM_KRS);
    const slice = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);
    const layoutResult = layout(slice);
    const ghostEdges = layoutResult.edges.filter((e) => e.ghost);
    expect(ghostEdges).toHaveLength(1);
    expect(ghostEdges[0].from).toBe("ECPlatform.OrderService");
    expect(ghostEdges[0].to).toBe("PaymentService");
    // Caller is to the left, so toPoint.x > fromPoint.x
    expect(ghostEdges[0].toPoint.x).toBeGreaterThan(ghostEdges[0].fromPoint.x);
  });

  it("applies barycenter ordering within each system's layers to minimize edge crossings", () => {
    // Layer 0: [A, B, C] (left to right). Layer 1 inserted as [X, Y, Z].
    // Edges: A→Z, B→Y, C→X → barycenter reorders layer 1 to [Z, Y, X]
    const krs = `
system SysA {
  domain A {}
  domain B {}
  domain C {}
  domain X {}
  domain Y {}
  domain Z {}
  A -> Z
  B -> Y
  C -> X
}
system SysB {
  domain D {}
}
`;
    const result = Parser.parse(krs);
    const slice = extractView(result.value.systems, []);
    const layoutResult = layout(slice);

    const zA = layoutResult.nodes.get("Z");
    const yA = layoutResult.nodes.get("Y");
    const xA = layoutResult.nodes.get("X");
    expect(zA).toBeDefined();
    expect(yA).toBeDefined();
    expect(xA).toBeDefined();
    // Barycenter sort: Z has predecessor A (leftmost), Y has B (middle), X has C (rightmost)
    // So order should be Z < Y < X in X coordinate
    expect(zA!.x).toBeLessThan(yA!.x);
    expect(yA!.x).toBeLessThan(xA!.x);
  });

  it("wraps nodes to a new sub-row when a layer exceeds MAX_LAYER_WIDTH", () => {
    // 6 nodes with ~12-char labels in one layer (no edges → all layer 0).
    // Total width exceeds MAX_LAYER_WIDTH (1200), so wrapping should occur.
    const krs = `
system SysA {
  domain ServiceAAAAA {}
  domain ServiceBBBBB {}
  domain ServiceCCCCC {}
  domain ServiceDDDDD {}
  domain ServiceEEEEE {}
  domain ServiceFFFFF {}
}
system SysB {
  domain D {}
}
`;
    const result = Parser.parse(krs);
    const slice = extractView(result.value.systems, []);
    const layoutResult = layout(slice);

    const yCoords = new Set(
      [
        "ServiceAAAAA",
        "ServiceBBBBB",
        "ServiceCCCCC",
        "ServiceDDDDD",
        "ServiceEEEEE",
        "ServiceFFFFF",
      ]
        .map((id) => layoutResult.nodes.get(id)?.y)
        .filter((y): y is number => y !== undefined),
    );
    // At least two distinct Y values means wrapping occurred
    expect(yCoords.size).toBeGreaterThan(1);
  });

  it("does not produce negative x coordinates when multiple wide caller ghost systems are present", () => {
    // Many caller systems or long labels cause totalCallerWidth > outermost.x - GHOST_SYSTEM_GAP,
    // which would push callerStartX negative without normalization.
    const WIDE_CALLERS_KRS = `
system CallerA {
  service VeryLongServiceNameThatMakesContainerWide {}
  VeryLongServiceNameThatMakesContainerWide -> Target.TargetService "calls"
}
system CallerB {
  service AnotherVeryLongServiceNameHere {}
  AnotherVeryLongServiceNameHere -> Target.TargetService "calls too"
}
system CallerC {
  service YetAnotherLongServiceNameForTesting {}
  YetAnotherLongServiceNameForTesting -> Target.TargetService "also calls"
}
system Target {
  service TargetService {}
}
`;
    const result = Parser.parse(WIDE_CALLERS_KRS);
    const slice = extractView(result.value.systems, ["Target", "TargetService"]);
    const layoutResult = layout(slice);

    for (const container of layoutResult.containers) {
      expect(container.x).toBeGreaterThanOrEqual(0);
    }
    for (const [, node] of layoutResult.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
    }
    for (const edge of layoutResult.edges) {
      expect(edge.fromPoint.x).toBeGreaterThanOrEqual(0);
      expect(edge.toPoint.x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("layout > forced system layers (Phase 6 of #823)", () => {
  it("places user, client, and service in three distinct rows", () => {
    const slice = parseAndExtract(`
system S {
  user Customer [human]
  client WebApp [web]
  service Backend {}
  Customer -> WebApp
  WebApp -> Backend
}
`);
    const result = layout(slice);
    const u = result.nodes.get("Customer")!;
    const c = result.nodes.get("WebApp")!;
    const s = result.nodes.get("Backend")!;
    expect(u.y).toBeLessThan(c.y);
    expect(c.y).toBeLessThan(s.y);
  });

  it("keeps a user in the top row even when topo sort would push it below", () => {
    // Sharper than the obvious "user has no edges" case: here Subscriber is
    // the *target* of a service edge, so topological sort would assign it to
    // layer 1 (below the service). Forced kind-based layout must override
    // that and pin a user with no outgoing edges to the top row. (Users with
    // outgoing edges to deeper rows are pulled down — see the actor-bypass
    // test below.)
    const slice = parseAndExtract(`
system S {
  service Notifier {}
  user Subscriber [human]
  Notifier -> Subscriber
}
`);
    const result = layout(slice);
    const notifier = result.nodes.get("Notifier")!;
    const subscriber = result.nodes.get("Subscriber")!;
    // Without forcing, topo would give Notifier.y < Subscriber.y. Forced
    // layout flips it: user above service.
    expect(subscriber.y).toBeLessThan(notifier.y);
  });

  it("places an actor that bypasses the client tier in the client row, not the top row", () => {
    // Issue #967: when most actors go through an intermediate client but one
    // (e.g. an admin) connects directly to a deeper service, the direct edge
    // would otherwise have to cut through the client card. Place that actor
    // in the row immediately above its closest target.
    const slice = parseAndExtract(`
system S {
  user Customer [human]
  user Seller [human]
  user Admin [human]
  client MobileApp [mobile]
  service ECSite {}
  Customer -> MobileApp
  Seller -> MobileApp
  Admin -> ECSite
  MobileApp -> ECSite
}
`);
    const result = layout(slice);
    const customer = result.nodes.get("Customer")!;
    const seller = result.nodes.get("Seller")!;
    const admin = result.nodes.get("Admin")!;
    const mobile = result.nodes.get("MobileApp")!;
    const site = result.nodes.get("ECSite")!;
    // Customer / Seller stay at the top because their target (MobileApp) is
    // already on the next row. Admin moves down to the same row as MobileApp,
    // so its edge to ECSite no longer crosses the MobileApp card.
    expect(customer.y).toBeLessThan(mobile.y);
    expect(seller.y).toBeLessThan(mobile.y);
    expect(admin.y).toBe(mobile.y);
    expect(mobile.y).toBeLessThan(site.y);
  });

  it("collapses to two rows when no client is declared (user → service fallback)", () => {
    const slice = parseAndExtract(`
system S {
  user Customer [human]
  service Backend {}
  Customer -> Backend
}
`);
    const result = layout(slice);
    const u = result.nodes.get("Customer")!;
    const s = result.nodes.get("Backend")!;
    // Two distinct rows; user is above service
    expect(u.y).toBeLessThan(s.y);
  });

  it("preserves declaration order within each forced layer (multi-system path)", () => {
    // Multi-system root view goes through layoutMultipleSystems(); that's the
    // only path that applies the barycenter heuristic, so this is where
    // "force declaration order" actually has work to do.
    //
    // Crossing edges U1→C2 and U2→C1 give:
    //   - barycenter(C1) = x(U2)  (right)
    //   - barycenter(C2) = x(U1)  (left)
    // so without forcing, sortByBarycenter would flip the client row to
    // [C2, C1]. Forced layout must keep declaration order [C1, C2].
    const krs = `
system S {
  user U1 [human]
  user U2 [human]
  client C1 [web]
  client C2 [web]
  service ServiceA {}
  U1 -> C2
  U2 -> C1
}
system Other {
  service Z {}
}
`;
    const parsed = Parser.parse(krs);
    const slice = extractView(parsed.value.systems, [], parsed.value.domains);
    const result = layout(slice);
    const c1 = result.nodes.get("C1")!;
    const c2 = result.nodes.get("C2")!;
    expect(c1.x).toBeLessThan(c2.x);
  });

  it("places dep tier (infra + external) below internal services", () => {
    const slice = parseAndExtract(`
system S {
  user Customer [human]
  client App [web]
  service Backend {}
  database Postgres {}
  queue Jobs {}
  storage Blobs {}
  service Stripe [external] {}
  Customer -> App
  App -> Backend
  Backend -> Stripe
}
`);
    const result = layout(slice);
    const customer = result.nodes.get("Customer")!;
    const app = result.nodes.get("App")!;
    const backend = result.nodes.get("Backend")!;
    const postgres = result.nodes.get("Postgres")!;
    const jobs = result.nodes.get("Jobs")!;
    const blobs = result.nodes.get("Blobs")!;
    const stripe = result.nodes.get("Stripe")!;
    expect(customer.y).toBeLessThan(app.y);
    expect(app.y).toBeLessThan(backend.y);
    expect(backend.y).toBeLessThan(postgres.y);
    // No edges among dep nodes → all share one sub-row
    expect(postgres.y).toBe(jobs.y);
    expect(jobs.y).toBe(blobs.y);
    expect(postgres.y).toBe(stripe.y);
  });

  it("places database [external] in the dep tier alongside infra (tag does not change tier here)", () => {
    // Both infra-kind and `[external]` collapse into the same dep tier.
    // Without intra-dep edges, OurDb and SaaSDb share a sub-row; visual
    // distinction comes from the [external] style, not from layout.
    const slice = parseAndExtract(`
system S {
  service Backend {}
  database OurDb {}
  database SaaSDb [external] {}
}
`);
    const result = layout(slice);
    const backend = result.nodes.get("Backend")!;
    const ourDb = result.nodes.get("OurDb")!;
    const saasDb = result.nodes.get("SaaSDb")!;
    expect(backend.y).toBeLessThan(ourDb.y);
    expect(ourDb.y).toBe(saasDb.y);
  });

  it("forces internal-vs-dep split even without user/client", () => {
    // A pure backend system with just service + database still gets the
    // forced split: service above database.
    const slice = parseAndExtract(`
system S {
  service Backend {}
  database Postgres {}
}
`);
    const result = layout(slice);
    const backend = result.nodes.get("Backend")!;
    const postgres = result.nodes.get("Postgres")!;
    expect(backend.y).toBeLessThan(postgres.y);
  });

  it("topo-layers internal services by call relationships within the internal tier", () => {
    // A → B → C: each call is a sub-row inside the internal tier, so the
    // chain reads top-to-bottom even though all three are services.
    const slice = parseAndExtract(`
system S {
  service A {}
  service B {}
  service C {}
  A -> B
  B -> C
}
`);
    const result = layout(slice);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const c = result.nodes.get("C")!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
  });

  it("topo-layers the dep tier by intra-dep edges", () => {
    // queue Q → database D: an intra-dep edge orders Q above D inside
    // the dep tier, while internal services stay above both.
    const slice = parseAndExtract(`
system S {
  service App {}
  queue Q {}
  database D {}
  Q -> D
  App -> Q
}
`);
    const result = layout(slice);
    const app = result.nodes.get("App")!;
    const q = result.nodes.get("Q")!;
    const d = result.nodes.get("D")!;
    expect(app.y).toBeLessThan(q.y);
    expect(q.y).toBeLessThan(d.y);
  });

  it("does not let a cross-tier edge bleed into per-tier sub-row assignment", () => {
    // Backend → DB is a cross-tier edge. Within the internal tier, A and
    // Backend are independent (no A→Backend edge), so they share row 0 of
    // the internal tier. Backend's edge to DB only affects DB's tier
    // placement, not Backend's sub-row.
    const slice = parseAndExtract(`
system S {
  service A {}
  service Backend {}
  database DB {}
  Backend -> DB
}
`);
    const result = layout(slice);
    const a = result.nodes.get("A")!;
    const backend = result.nodes.get("Backend")!;
    const db = result.nodes.get("DB")!;
    // A and Backend on the same internal sub-row
    expect(a.y).toBe(backend.y);
    expect(backend.y).toBeLessThan(db.y);
  });

  it("places external services in a row below internal services", () => {
    const slice = parseAndExtract(`
system S {
  user Customer [human]
  client App [web]
  service Backend {}
  service Stripe [external] {}
  Customer -> App
  App -> Backend
  Backend -> Stripe
}
`);
    const result = layout(slice);
    const customer = result.nodes.get("Customer")!;
    const app = result.nodes.get("App")!;
    const backend = result.nodes.get("Backend")!;
    const stripe = result.nodes.get("Stripe")!;
    expect(customer.y).toBeLessThan(app.y);
    expect(app.y).toBeLessThan(backend.y);
    expect(backend.y).toBeLessThan(stripe.y);
  });

  it("pulls a dep used only by an upper service up to one row below its consumer (Issue #974)", () => {
    // Mirror of the actor-bypass test: A → B → C is a deep service chain;
    // Cache is consumed only by A. Without the dep pull-up, Cache would sit
    // at the global bottom (below C), with its edge cutting through B and C.
    // The post-pass places Cache one row below A instead.
    const slice = parseAndExtract(`
system S {
  service A {}
  service B {}
  service C {}
  database Cache {}
  A -> B
  B -> C
  A -> Cache
}
`);
    const result = layout(slice);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const c = result.nodes.get("C")!;
    const cache = result.nodes.get("Cache")!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    // Cache is pulled up to the row immediately below A — same row as B —
    // not the global bottom below C.
    expect(cache.y).toBe(b.y);
  });

  it("keeps a dep with no incoming edges at the bottom-tier default (Issue #974)", () => {
    // The pull-up must skip deps with no incoming edges so that "all infra
    // at the bottom" still works for orphan or unused infra nodes.
    const slice = parseAndExtract(`
system S {
  service A {}
  service B {}
  database Orphan {}
  A -> B
}
`);
    const result = layout(slice);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const orphan = result.nodes.get("Orphan")!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(orphan.y);
  });

  it("places a shared dep just below its deepest consumer (Issue #974)", () => {
    // When multiple consumers across different rows point to the same dep,
    // max(source_layer) + 1 places it just below the deepest. Here B is
    // deeper than A and both point to Cache → Cache sits one row below B.
    const slice = parseAndExtract(`
system S {
  service A {}
  service B {}
  service C {}
  database Cache {}
  A -> B
  B -> C
  A -> Cache
  B -> Cache
}
`);
    const result = layout(slice);
    const c = result.nodes.get("C")!;
    const cache = result.nodes.get("Cache")!;
    // Cache aligns to the row right below B — the same row as C — rather
    // than dropping to a row of its own under C.
    expect(cache.y).toBe(c.y);
  });

  it("does not push a dep down when its source is below it (Issue #974, downward-safe)", () => {
    // External service Stripe is consumed by Backend; with the pull-up,
    // Stripe sits one row below Backend. A second external Other has no
    // incoming edges — it must stay at the existing dep-tier row, not be
    // pushed up or down by the post-pass.
    const slice = parseAndExtract(`
system S {
  service Backend {}
  service Stripe [external] {}
  service Other [external] {}
  Backend -> Stripe
}
`);
    const result = layout(slice);
    const backend = result.nodes.get("Backend")!;
    const stripe = result.nodes.get("Stripe")!;
    const other = result.nodes.get("Other")!;
    // Stripe is pulled up to the row immediately below Backend.
    expect(backend.y).toBeLessThan(stripe.y);
    // Other has no incoming edges → keeps the default dep-tier row, which
    // (because Stripe was pulled up) is the same row as Stripe in this
    // two-row layout.
    expect(other.y).toBe(stripe.y);
  });

  it("propagates pull-up through a dep-on-dep chain regardless of declaration order (Issue #974)", () => {
    // External Auth is consumed only by Stripe; Stripe is consumed only by
    // Backend. The pull-up must place Auth one row below Stripe, even when
    // Auth happens to be declared before Stripe (so the naive single-pass
    // version would process Auth before Stripe is updated).
    const slice = parseAndExtract(`
system S {
  service Backend {}
  service Auth [external] {}
  service Stripe [external] {}
  Backend -> Stripe
  Stripe -> Auth
}
`);
    const result = layout(slice);
    const backend = result.nodes.get("Backend")!;
    const stripe = result.nodes.get("Stripe")!;
    const auth = result.nodes.get("Auth")!;
    expect(backend.y).toBeLessThan(stripe.y);
    expect(stripe.y).toBeLessThan(auth.y);
  });

  it("compacts to two rows when only internal and external services are declared", () => {
    // No user, no client: internal moves up to row 0, external to row 1.
    const slice = parseAndExtract(`
system S {
  service Backend {}
  service Stripe [external] {}
  Backend -> Stripe
}
`);
    const result = layout(slice);
    const backend = result.nodes.get("Backend")!;
    const stripe = result.nodes.get("Stripe")!;
    expect(backend.y).toBeLessThan(stripe.y);
    // Row 0 means y starts near NODE_GAP (60).
    expect(backend.y).toBeLessThan(200);
  });

  it("compacts to two rows when only client (no user) is declared", () => {
    // Edge case for the helper's row-compaction logic: a system with `client`
    // but no `user` should not leave row 0 empty — client moves up to row 0.
    const slice = parseAndExtract(`
system S {
  client App [web]
  service Backend {}
  App -> Backend
}
`);
    const result = layout(slice);
    const app = result.nodes.get("App")!;
    const backend = result.nodes.get("Backend")!;
    expect(app.y).toBeLessThan(backend.y);
    // Row 0 means y starts near NODE_GAP (60), not near 2*(h+LAYER_GAP).
    // A non-compacted layout would put App well below 200px.
    expect(app.y).toBeLessThan(200);
  });

  it("keeps client card height stable regardless of resource count (Issue #914)", () => {
    // Phase 5 grew the card by `LINE_HEIGHT` per resource; #914 collapsed
    // the per-line rendering into a single badge so the height adds at
    // most one line, no matter how many resources are declared.
    const oneRes = parseAndExtract(`
system S {
  client A [web] { resource localStorage "x" }
  service B {}
  A -> B
}
`);
    const sixRes = parseAndExtract(`
system S {
  client A [web] {
    resource localStorage "a"
    resource sessionStorage "b"
    resource indexedDB "c"
    resource opfs "d"
    resource file "e"
    resource keychain "f"
  }
  service B {}
  A -> B
}
`);
    const a1 = layout(oneRes).nodes.get("A")!;
    const a6 = layout(sixRes).nodes.get("A")!;
    expect(a6.height).toBe(a1.height);
  });

  it("applies forced layering independently per system in the multi-system root view", () => {
    // System A has all four tiers (user / client / internal / external).
    // System B has only internal + external. Each system compacts its own
    // bucket set; rows are *not* aligned across systems.
    const krs = `
system A {
  user U [human]
  client C [web]
  service AInternal {}
  service AExt [external] {}
  U -> C
  C -> AInternal
  AInternal -> AExt
}
system B {
  service BInternal {}
  service BExt [external] {}
  BInternal -> BExt
}
`;
    const parsed = Parser.parse(krs);
    const slice = extractView(parsed.value.systems, [], parsed.value.domains);
    const result = layout(slice);

    // System A: four ordered rows
    const u = result.nodes.get("U")!;
    const c = result.nodes.get("C")!;
    const aInt = result.nodes.get("AInternal")!;
    const aExt = result.nodes.get("AExt")!;
    expect(u.y).toBeLessThan(c.y);
    expect(c.y).toBeLessThan(aInt.y);
    expect(aInt.y).toBeLessThan(aExt.y);

    // System B: two compacted rows (internal at row 0, external at row 1)
    const bInt = result.nodes.get("BInternal")!;
    const bExt = result.nodes.get("BExt")!;
    expect(bInt.y).toBeLessThan(bExt.y);

    // Containers are placed side by side (B to the right of A)
    const aContainer = result.containers.find((cn) => cn.id === "A")!;
    const bContainer = result.containers.find((cn) => cn.id === "B")!;
    expect(bContainer.x).toBeGreaterThan(aContainer.x + aContainer.width);

    // Row alignment is intentionally NOT enforced across systems:
    // B's internal row uses its own row 0, so it sits higher than A's
    // internal row (which is row 2). This pins down current behavior; if
    // we ever want cross-system row alignment, this assertion changes.
    expect(bInt.y).toBeLessThan(aInt.y);
  });
});

describe("layout > orthogonal edge routing", () => {
  it("adds waypoints to a skip-layer edge whose straight line crosses an intermediate node", () => {
    // Customer/Seller go through MobileApp; Admin goes directly to ECSite.
    // Without A's row-by-target fix, Admin sits in row 0 alongside the others
    // and its straight edge passes through MobileApp's bounding box.
    const slice = parseAndExtract(`
system EC {
  user Customer {}
  user Seller {}
  user Admin {}
  client MobileApp {}
  service ECSite {}
  Customer -> MobileApp
  Seller -> MobileApp
  MobileApp -> ECSite
  Admin -> ECSite
}
    `);
    const result = layout(slice);
    const adminEdge = result.edges.find((e) => e.from === "Admin" && e.to === "ECSite");
    expect(adminEdge).toBeDefined();
    // Either orthogonal waypoints get inserted, or the straight line is
    // already clear (e.g. if A's actor-row fix lands later and puts Admin
    // adjacent to ECSite). In both cases the routed path must not cross
    // MobileApp's bounding box.
    const mobileApp = result.nodes.get("MobileApp")!;
    const path = [adminEdge!.fromPoint, ...(adminEdge!.waypoints ?? []), adminEdge!.toPoint];
    expect(pathCrossesRect(path, mobileApp)).toBe(false);
  });
});

// Liang-Barsky helpers intentionally duplicated here rather than imported
// from edge-routing-channels.ts: sharing the same implementation in tests
// would mask a regression in the production copy.
function pathCrossesRect(
  path: { x: number; y: number }[],
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (segmentCrossesRectInterior(path[i], path[i + 1], rect)) return true;
  }
  return false;
}

function segmentCrossesRectInterior(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x: number; y: number; width: number; height: number },
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] <= 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-6;
}

describe("layout > port distribution (Phase 3)", () => {
  it("spreads multiple downward edges from a hub across distinct x ports", () => {
    const slice = parseAndExtract(`
system S {
  service Hub {}
  service A {}
  service B {}
  service C {}
  Hub -> A
  Hub -> B
  Hub -> C
}
    `);
    const result = layout(slice);
    const outgoing = result.edges.filter((e) => e.from === "Hub");
    expect(outgoing).toHaveLength(3);
    const xs = outgoing.map((e) => e.fromPoint.x).sort((a, b) => a - b);
    // All three ports must be distinct.
    expect(new Set(xs).size).toBe(3);
    // Ports stay inside the hub's bottom side.
    const hub = result.nodes.get("Hub")!;
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(hub.x);
      expect(x).toBeLessThanOrEqual(hub.x + hub.width);
    }
  });
});

describe("layout > port distribution + orthogonal routing interaction", () => {
  it("distributed ports do not introduce new obstacle crossings (Phase 3 + Phase 2 cooperate)", () => {
    // Hub fanning out across two rows: row 0 = top hub, row 1 = three
    // siblings between (acting as potential obstacles), row 2 = three
    // targets below. After port distribution spreads the hub's outgoing
    // edges, each must either be obstacle-free or get routed orthogonally
    // by Phase 2 — never silently cross an intermediate node.
    const slice = parseAndExtract(`
system S {
  service Hub {}
  service Mid1 {}
  service Mid2 {}
  service Mid3 {}
  service Bot1 {}
  service Bot2 {}
  service Bot3 {}
  Hub -> Mid1
  Hub -> Mid2
  Hub -> Mid3
  Hub -> Bot1
  Hub -> Bot2
  Hub -> Bot3
}
    `);
    const result = layout(slice);
    const mids = ["Mid1", "Mid2", "Mid3"].map((id) => result.nodes.get(id)!);
    const targets = ["Bot1", "Bot2", "Bot3"];

    for (const targetId of targets) {
      const edge = result.edges.find((e) => e.from === "Hub" && e.to === targetId);
      expect(edge).toBeDefined();
      const path = [edge!.fromPoint, ...(edge!.waypoints ?? []), edge!.toPoint];
      // No segment of the routed path may cross any Mid* card's interior.
      for (const mid of mids) {
        expect(pathCrossesRect(path, mid)).toBe(false);
      }
    }

    // Hub-side ports must be distinct (port distribution succeeded).
    const hubEdges = result.edges.filter((e) => e.from === "Hub");
    const xs = hubEdges.map((e) => e.fromPoint.x);
    expect(new Set(xs).size).toBe(xs.length);
  });
});

describe("layout > column hint (#969)", () => {
  // The column hint buckets nodes inside a layer into [left, middle, right]
  // before the existing within-layer ordering kicks in. In the system view
  // the input order *is* declaration order (Q11), so bucketing is the only
  // x-axis intervention. These tests exercise both the single-system path
  // and the multi-system path of layoutMultipleSystems().
  const krs = `
system S {
  service A {}
  service B {}
  service C {}
  database DB {}
}
`;

  it("places left-bucket nodes before middle, right-bucket after middle (single-system path)", () => {
    const slice = parseAndExtract(krs);
    const hints = new Map([
      ["B", { column: "left" as const }],
      ["C", { column: "right" as const }],
    ]);
    const result = layout(slice, undefined, undefined, hints);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const c = result.nodes.get("C")!;
    expect(b.x).toBeLessThan(a.x);
    expect(a.x).toBeLessThan(c.x);
  });

  it("preserves declaration order within each bucket", () => {
    // Two left-bucket nodes (A, C) must keep declaration order A < C in the
    // left bucket; B (unspecified) goes to middle.
    const slice = parseAndExtract(krs);
    const hints = new Map([
      ["A", { column: "left" as const }],
      ["C", { column: "left" as const }],
    ]);
    const result = layout(slice, undefined, undefined, hints);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const c = result.nodes.get("C")!;
    expect(a.x).toBeLessThan(c.x);
    expect(c.x).toBeLessThan(b.x);
  });

  it("treats column: center as middle (same bucket as unspecified)", () => {
    const slice = parseAndExtract(krs);
    const hints = new Map([
      ["A", { column: "left" as const }],
      ["B", { column: "center" as const }],
    ]);
    const result = layout(slice, undefined, undefined, hints);
    const a = result.nodes.get("A")!;
    const b = result.nodes.get("B")!;
    const c = result.nodes.get("C")!;
    // A is left, B and C share middle → A < B and A < C.
    expect(a.x).toBeLessThan(b.x);
    expect(a.x).toBeLessThan(c.x);
  });

  it("layout output is unchanged when no hints are passed", () => {
    const slice = parseAndExtract(krs);
    const baseline = layout(slice);
    const explicitEmpty = layout(slice, undefined, undefined, new Map());
    for (const id of ["A", "B", "C", "DB"]) {
      expect(explicitEmpty.nodes.get(id)!.x).toBe(baseline.nodes.get(id)!.x);
    }
  });

  it("applies bucketing in the multi-system root path", () => {
    // Two systems forces the layoutMultipleSystems() codepath. The actor +
    // services in system A trigger the forced-layer codepath so the bucket
    // pass actually runs (without an actor, assignForcedSystemLayers
    // returns null and the column hint is intentionally skipped).
    const slice = parseAndExtract(`
system A {
  user U [human]
  service X {}
  service Y {}
  U -> X
  U -> Y
}
system B {
  service Z {}
}
`);
    const hints = new Map([["Y", { column: "left" as const }]]);
    const result = layout(slice, undefined, undefined, hints);
    const x = result.nodes.get("X")!;
    const y = result.nodes.get("Y")!;
    expect(y.x).toBeLessThan(x.x);
  });

  it("nodes with different heights in the same layer share a y baseline", () => {
    // Pre-fix, `y = layerIdx * (dims.height + LAYER_GAP) + NODE_GAP` used
    // each node's own height, so a service with a team chip would slip
    // below its rowmate cylinders / queues. The column hint exposed this
    // by reordering and visually highlighting the gap. Guard against
    // regression: rowmates in the same forced layer must start at the
    // same y. Database / queue / storage all live in tier 3 (dep), so
    // mixing them gives heterogeneous heights inside one layer.
    const slice = parseAndExtract(`
system S {
  service Backend {}
  database Cyl {}
  queue Q {}
  storage Cloud {}
}
`);
    const result = layout(slice);
    const cyl = result.nodes.get("Cyl")!;
    const q = result.nodes.get("Q")!;
    const cloud = result.nodes.get("Cloud")!;
    expect(cyl.y).toBe(q.y);
    expect(q.y).toBe(cloud.y);
  });

  it("no-op when every node is in the same bucket (unspecified)", () => {
    const slice = parseAndExtract(krs);
    const baseline = layout(slice);
    const allCenter = layout(
      slice,
      undefined,
      undefined,
      new Map([
        ["A", { column: "center" as const }],
        ["B", { column: "center" as const }],
        ["C", { column: "center" as const }],
      ]),
    );
    for (const id of ["A", "B", "C"]) {
      expect(allCenter.nodes.get(id)!.x).toBe(baseline.nodes.get(id)!.x);
    }
  });
});
