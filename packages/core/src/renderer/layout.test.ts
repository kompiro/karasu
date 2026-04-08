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
