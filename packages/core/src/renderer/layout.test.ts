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
    // containerNode is Service (not system) → 1 focused container (no ghost ancestors)
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

describe("layout > no ghost ancestor containers at drill-down levels", () => {
  it("produces only the focused container (no ghost ancestors) at service level", () => {
    // Issue #182: ghost ancestor containers caused parent hierarchy to visually overlap
    // the child level. Only the focused container should be rendered.
    const slice = parseAndExtract(
      `
system S {
  service Shop {
    label "ショップ"
    domain Order { label "注文" }
    domain Cart { label "カート" }
  }
}
    `,
      ["Shop"],
    );
    const result = layout(slice);
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].ghost).toBe(false);
    expect(result.containers[0].id).toBe("Shop");
  });

  it("produces only the focused container (no ghost ancestors) at domain level", () => {
    const slice = parseAndExtract(
      `
system S {
  service Shop {
    domain Order {
      usecase PlaceOrder { label "注文する" }
      usecase CancelOrder { label "キャンセル" }
    }
  }
}
    `,
      ["Shop", "Order"],
    );
    const result = layout(slice);
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].ghost).toBe(false);
    expect(result.containers[0].id).toBe("Order");
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
