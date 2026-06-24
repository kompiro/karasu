import { describe, it, expect } from "vitest";
import { resolveStyles, nodeStyleKey } from "./style-resolver.js";
import { analyze } from "./warnings.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import type {
  KrsNode,
  KrsFile,
  DeployNode,
  OrganizationBlock,
  TeamNode,
  MemberNode,
} from "../types/ast.js";
import type { StyleSheet, StyleRule } from "../types/style.js";
import type { SourceRange } from "../types/tokens.js";

const dummyLoc: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function makeNode(overrides: Partial<KrsNode> & { kind: KrsNode["kind"]; id: string }): KrsNode {
  const base = {
    tags: [] as string[],
    annotations: [] as string[],
    children: [] as KrsNode[],
    edges: [],
    loc: dummyLoc,
    properties: { links: [] },
  };
  return { ...base, ...overrides } as KrsNode;
}

function makeFile(overrides: Partial<KrsFile>): KrsFile {
  return {
    styleImports: [],
    nodeImports: [],
    systems: [],
    services: [],
    clients: [],
    domains: [],
    databases: [],
    queues: [],
    storages: [],
    deploys: [],
    organizations: [],
    legends: [],
    ownerIndex: new Map(),
    nodePathIndex: new Map(),
    nodeFileIndex: new Map(),
    ...overrides,
  };
}

const ZERO_RANGE = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeRule(
  selectorPartial: Omit<StyleRule["selector"], "loc"> & { loc?: StyleRule["selector"]["loc"] },
  properties: Record<string, string>,
  specificity: number,
  sourceIndex = 0,
): StyleRule {
  const selector: StyleRule["selector"] = {
    ...selectorPartial,
    loc: selectorPartial.loc ?? ZERO_RANGE,
  };
  return {
    selector,
    properties,
    specificity,
    sourceIndex,
    loc: ZERO_RANGE,
    declarationLocs: {},
    sheetId: "<test>",
  };
}

describe("resolveStyles", () => {
  it("returns default styles when no rules match", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [makeNode({ kind: "service", id: "Svc", label: "Service" })],
    });
    const result = resolveStyles([system], []);
    const style = result.nodes.get("Svc")!;
    expect(style.backgroundColor).toBe("#374151");
    expect(style.shape).toBe("box");
  });

  it("applies type selector styles", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [makeNode({ kind: "service", id: "Svc", label: "Service" })],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "service", tags: [], annotations: [] },
          { "background-color": "#0369A1" },
          1,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Svc")!.backgroundColor).toBe("#0369A1");
  });

  it("applies tag selector styles", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Pay",
          label: "Payment",
          tags: ["external"],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [makeRule({ tags: ["external"], annotations: [] }, { "border-style": "dashed" }, 10)],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Pay")!.borderStyle).toBe("dashed");
  });

  it("gives `database [index]` an `index` badge from the builtin stylesheet (#1718)", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({ kind: "database", id: "SearchIdx", label: "Search", tags: ["index"] }),
        makeNode({ kind: "database", id: "OrderDB", label: "Orders" }),
      ],
    });
    const result = resolveStyles([system], [getBuiltinStyleSheet()]);
    const indexed = result.nodes.get("SearchIdx")!;
    // The [index] tag adds a badge but keeps the database cylinder.
    expect(indexed.badgeLabel).toBe("index");
    expect(indexed.shape).toBe("cylinder");
    // A plain database (system of record) carries no index badge.
    expect(result.nodes.get("OrderDB")!.badgeLabel).toBeUndefined();
  });

  it("applies annotation selector styles", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Legacy",
          label: "Legacy",
          annotations: ["deprecated"],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { tags: [], annotations: ["deprecated"] },
          { opacity: "0.6", "badge-icon": '"⚠"' },
          10,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Legacy")!.opacity).toBe(0.6);
    expect(result.nodes.get("Legacy")!.badgeIcon).toBe("⚠");
  });

  it("inherits parent service annotations into child domain styles", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [makeNode({ kind: "domain", id: "Order" })],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { tags: [], annotations: ["deprecated"] },
          { opacity: "0.6", "badge-icon": '"⚠"' },
          10,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Order")!.opacity).toBe(0.6);
    expect(result.nodes.get("Order")!.badgeIcon).toBe("⚠");
    // Qualified key under inherited annotations is also stored, so the renderer
    // can disambiguate same-id domains in different annotated services.
    expect(result.nodes.get(nodeStyleKey("Order", ["deprecated"]))!.opacity).toBe(0.6);
  });

  it("explicit child annotations override inherited ones", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [
            makeNode({
              kind: "domain",
              id: "Order",
              annotations: ["migration_target"],
            }),
          ],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ tags: [], annotations: ["deprecated"] }, { opacity: "0.5" }, 10, 0),
        makeRule(
          { tags: [], annotations: ["migration_target"] },
          { opacity: "0.8", "badge-icon": '"→"' },
          10,
          1,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Order")!.opacity).toBe(0.8);
    expect(result.nodes.get("Order")!.badgeIcon).toBe("→");
  });

  it("disambiguates same-id domains in differently annotated services", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Legacy",
          annotations: ["deprecated"],
          children: [makeNode({ kind: "domain", id: "Order" })],
        }),
        makeNode({
          kind: "service",
          id: "NewSvc",
          annotations: ["migration_target"],
          children: [makeNode({ kind: "domain", id: "Order" })],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ tags: [], annotations: ["deprecated"] }, { opacity: "0.5" }, 10, 0),
        makeRule({ tags: [], annotations: ["migration_target"] }, { opacity: "0.8" }, 10, 1),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    // Both qualified keys must exist with their distinct styles.
    expect(result.nodes.get(nodeStyleKey("Order", ["deprecated"]))!.opacity).toBe(0.5);
    expect(result.nodes.get(nodeStyleKey("Order", ["migration_target"]))!.opacity).toBe(0.8);
  });

  it("higher specificity overrides lower", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Svc",
          label: "Svc",
          tags: ["external"],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "service", tags: [], annotations: [] },
          { "background-color": "#AAA" },
          1,
          0,
        ),
        makeRule({ tags: ["external"], annotations: [] }, { "background-color": "#BBB" }, 10, 1),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Svc")!.backgroundColor).toBe("#BBB");
  });

  it("same specificity: later source index wins", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "Svc",
          label: "Svc",
          tags: ["external"],
          annotations: ["deprecated"],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ tags: ["external"], annotations: [] }, { "background-color": "#AAA" }, 10, 0),
        makeRule({ tags: [], annotations: ["deprecated"] }, { "background-color": "#BBB" }, 10, 1),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("Svc")!.backgroundColor).toBe("#BBB");
  });

  it("ID selector overrides everything", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({
          kind: "service",
          id: "EC",
          label: "EC",
          tags: ["external"],
        }),
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ tags: ["external"], annotations: [] }, { "background-color": "#AAA" }, 10, 0),
        makeRule({ id: "EC", tags: [], annotations: [] }, { "background-color": "#CCC" }, 100, 1),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("EC")!.backgroundColor).toBe("#CCC");
  });

  it("resolves edge styles", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({ kind: "service", id: "A", label: "A" }),
        makeNode({ kind: "service", id: "B", label: "B" }),
      ],
      edges: [
        {
          from: "A",
          to: "B",
          label: "call",
          kind: "async",
          tags: [],
          loc: dummyLoc,
        },
      ],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ nodeType: "edge", tags: [], annotations: [] }, { color: "#FF0000" }, 1, 0),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    const edgeStyle = result.edges.get("A->B")!;
    expect(edgeStyle.color).toBe("#FF0000");
  });

  describe("edge#<id> selector", () => {
    it("matches an edge by author id and beats a tag selector", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: ["write"],
          loc: dummyLoc,
          authorId: "criticalWrite",
          canonicalId: "criticalWrite",
        },
        {
          from: "C",
          to: "D",
          kind: "sync" as const,
          tags: ["write"],
          loc: dummyLoc,
          canonicalId: "C->D",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: ["write"], annotations: [] },
            { color: "#000000" },
            11,
            0,
          ),
          makeRule(
            { nodeType: "edge", edgeId: "criticalWrite", tags: [], annotations: [] },
            { color: "#FF0000" },
            101,
            1,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.color).toBe("#FF0000");
      expect(result.edges.get("C->D")!.color).toBe("#000000");
    });

    it("matches an edge by computed sync base id", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A->B",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", edgeId: "A->B", tags: [], annotations: [] },
            { color: "#FF0000" },
            101,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.color).toBe("#FF0000");
    });

    it("matches an edge by computed async base id without matching the sync rule", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "async" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A-->B",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", edgeId: "A-->B", tags: [], annotations: [] },
            { color: "#00FF00" },
            101,
            0,
          ),
          makeRule(
            { nodeType: "edge", edgeId: "A->B", tags: [], annotations: [] },
            { color: "#0000FF" },
            101,
            1,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.color).toBe("#00FF00");
    });

    it("does not match an edge whose canonicalId was cleared by a base collision", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: undefined,
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", edgeId: "A->B", tags: [], annotations: [] },
            { color: "#FF0000" },
            101,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      // Default edge color from DEFAULT_EDGE_STYLE.
      expect(result.edges.get("A->B")!.color).not.toBe("#FF0000");
    });
  });

  it("resolves async edge as dashed via builtin stylesheet", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [
        makeNode({ kind: "service", id: "A", label: "A" }),
        makeNode({ kind: "service", id: "B", label: "B" }),
      ],
      edges: [
        {
          from: "A",
          to: "B",
          label: "call",
          kind: "async",
          tags: [],
          loc: dummyLoc,
        },
      ],
    });
    const result = resolveStyles([system], [getBuiltinStyleSheet()]);
    const edgeStyle = result.edges.get("A->B")!;
    expect(edgeStyle.strokeStyle).toBe("dashed");
  });

  // TPL-20260510-07 item 3: a derivation-time tag (`[implicit]`) and the
  // edge's `kind` (sync / async) are orthogonal style dimensions. The
  // visual contract from #510 is that an implicit async edge renders
  // dashed-and-amber while an implicit sync edge renders solid-and-amber
  // — neither rule silently cancels the other. Today each rule is tested
  // in isolation (the "async dashed" case above; default-style.test.ts
  // for `edge[implicit]` existence), but nothing pins the *coexistence*
  // on a single edge. A future cascade refactor could break the
  // orthogonality and no test would notice.
  describe("[implicit] + kind coexistence (TPL-07 item 3 / #510)", () => {
    const IMPLICIT_AMBER = "#F59E0B";

    function resolveImplicitEdge(kind: "sync" | "async") {
      const system = makeNode({
        kind: "system",
        id: "Test",
        children: [
          makeNode({ kind: "service", id: "A", label: "A" }),
          makeNode({ kind: "service", id: "B", label: "B" }),
        ],
        edges: [
          {
            from: "A",
            to: "B",
            kind,
            tags: ["implicit"],
            loc: dummyLoc,
          },
        ],
      });
      const result = resolveStyles([system], [getBuiltinStyleSheet()]);
      return result.edges.get("A->B")!;
    }

    it("async + [implicit]: dashed (from edge[async]) AND amber (from edge[implicit])", () => {
      const edgeStyle = resolveImplicitEdge("async");
      expect(edgeStyle.color).toBe(IMPLICIT_AMBER);
      expect(edgeStyle.strokeStyle).toBe("dashed");
    });

    it("sync + [implicit]: solid (no dash) AND amber (still applies)", () => {
      const edgeStyle = resolveImplicitEdge("sync");
      expect(edgeStyle.color).toBe(IMPLICIT_AMBER);
      expect(edgeStyle.strokeStyle).not.toBe("dashed");
    });
  });

  describe("direction property", () => {
    it("defaults to auto when no rule sets it", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A->B",
        },
      ];
      const result = resolveStyles([], [], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.direction).toBe("auto");
    });

    it("applies a direction value from the cascade", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A->B",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule({ nodeType: "edge", tags: [], annotations: [] }, { direction: "down" }, 1, 0),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.direction).toBe("down");
    });

    it("higher-specificity edge#<id> rule overrides a base edge rule", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "criticalWrite",
          authorId: "criticalWrite",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule({ nodeType: "edge", tags: [], annotations: [] }, { direction: "auto" }, 1, 0),
          makeRule(
            { nodeType: "edge", edgeId: "criticalWrite", tags: [], annotations: [] },
            { direction: "down" },
            101,
            1,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.direction).toBe("down");
    });

    it("drops invalid direction values and keeps the default", () => {
      const sliceEdges = [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A->B",
        },
      ];
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { direction: "diagonal" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, sliceEdges);
      expect(result.edges.get("A->B")!.direction).toBe("auto");
    });
  });

  describe("label-position / label-offset properties", () => {
    function singleEdge() {
      return [
        {
          from: "A",
          to: "B",
          kind: "sync" as const,
          tags: [],
          loc: dummyLoc,
          canonicalId: "A->B",
        },
      ];
    }

    it("defaults label-position to 0.5 (midpoint) and label-offset to 0,0", () => {
      const result = resolveStyles([], [], undefined, undefined, undefined, singleEdge());
      const style = result.edges.get("A->B")!;
      expect(style.labelPosition).toBe(0.5);
      expect(style.labelOffsetX).toBe(0);
      expect(style.labelOffsetY).toBe(0);
    });

    it("translates the `start` keyword to 0", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-position": "start" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelPosition).toBe(0);
    });

    it("translates the `end` keyword to 1", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-position": "end" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelPosition).toBe(1);
    });

    it("accepts a fractional value", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-position": "0.25" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelPosition).toBe(0.25);
    });

    it("clamps fractional values outside [0, 1]", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-position": "1.5" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelPosition).toBe(1);
    });

    it("falls back to the default for unrecognised keywords / non-numeric values", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-position": "near-the-arrow" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelPosition).toBe(0.5);
    });

    it("parses a single-token label-offset as y-only (x stays 0)", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-offset": "8px" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelOffsetX).toBe(0);
      expect(result.edges.get("A->B")!.labelOffsetY).toBe(8);
    });

    it("parses a two-token label-offset as `dx dy`", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-offset": "4px 8px" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelOffsetX).toBe(4);
      expect(result.edges.get("A->B")!.labelOffsetY).toBe(8);
    });

    it("accepts negative offsets in either token", () => {
      const sheet: StyleSheet = {
        rules: [
          makeRule(
            { nodeType: "edge", tags: [], annotations: [] },
            { "label-offset": "-4px -8px" },
            1,
            0,
          ),
        ],
      };
      const result = resolveStyles([], [sheet], undefined, undefined, undefined, singleEdge());
      expect(result.edges.get("A->B")!.labelOffsetX).toBe(-4);
      expect(result.edges.get("A->B")!.labelOffsetY).toBe(-8);
    });
  });

  it("resolves [write] edge to stroke-width 2 via builtin stylesheet (read < write < cyclic)", () => {
    const writeSystem = makeNode({
      kind: "system",
      id: "WriteSys",
      children: [
        makeNode({ kind: "usecase", id: "WU", label: "WU" }),
        makeNode({ kind: "resource", id: "WR", label: "WR" }),
      ],
      edges: [
        {
          from: "WU",
          to: "WR",
          label: "W",
          kind: "sync",
          tags: ["write"],
          loc: dummyLoc,
        },
      ],
    });
    const readSystem = makeNode({
      kind: "system",
      id: "ReadSys",
      children: [
        makeNode({ kind: "usecase", id: "RU", label: "RU" }),
        makeNode({ kind: "resource", id: "RR", label: "RR" }),
      ],
      edges: [
        {
          from: "RU",
          to: "RR",
          label: "R",
          kind: "sync",
          tags: ["read"],
          loc: dummyLoc,
        },
      ],
    });
    const result = resolveStyles([writeSystem, readSystem], [getBuiltinStyleSheet()]);
    const writeStyle = result.edges.get("WU->WR")!;
    const readStyle = result.edges.get("RU->RR")!;
    // edge[write] from default-style picks up stroke-width: 2.
    expect(writeStyle.strokeWidth).toBe(2);
    // edge[read] from default-style pins stroke-width: 1.5 explicitly.
    expect(readStyle.strokeWidth).toBe(1.5);
    // Hierarchy: read (1.5) < write (2) < cyclic (2.5).
    expect(readStyle.strokeWidth).toBeLessThan(writeStyle.strokeWidth);
    expect(writeStyle.strokeWidth).toBeLessThan(2.5);
  });

  it("keeps read < write hierarchy when a user theme overrides the global edge width", () => {
    const system = makeNode({
      kind: "system",
      id: "Sys",
      children: [
        makeNode({ kind: "usecase", id: "U", label: "U" }),
        makeNode({ kind: "resource", id: "RR", label: "RR" }),
        makeNode({ kind: "resource", id: "WR", label: "WR" }),
      ],
      edges: [
        { from: "U", to: "RR", label: "R", kind: "sync", tags: ["read"], loc: dummyLoc },
        { from: "U", to: "WR", label: "W", kind: "sync", tags: ["write"], loc: dummyLoc },
      ],
    });
    // A plain `edge { stroke-width: 3; }` user rule (specificity 1) must not
    // outrank the builtin tag rules (specificity 10); without an explicit
    // edge[read] rule the hierarchy would invert (read → 3 while write stays 2).
    const userSheet: StyleSheet = {
      rules: [
        makeRule({ nodeType: "edge", tags: [], annotations: [] }, { "stroke-width": "3" }, 1, 0),
      ],
    };
    const result = resolveStyles([system], [getBuiltinStyleSheet(), userSheet]);
    const readStyle = result.edges.get("U->RR")!;
    const writeStyle = result.edges.get("U->WR")!;
    expect(readStyle.strokeWidth).toBe(1.5);
    expect(writeStyle.strokeWidth).toBe(2);
    expect(readStyle.strokeWidth).toBeLessThan(writeStyle.strokeWidth);
  });

  it("user stylesheet overrides builtin", () => {
    const system = makeNode({
      kind: "system",
      id: "Test",
      children: [makeNode({ kind: "resource", id: "DB", label: "DB" })],
    });
    const userSheet: StyleSheet = {
      rules: [
        makeRule({ nodeType: "resource", tags: [], annotations: [] }, { shape: "hexagon" }, 1, 0),
      ],
    };
    const result = resolveStyles([system], [getBuiltinStyleSheet(), userSheet]);
    expect(result.nodes.get("DB")!.shape).toBe("hexagon");
  });

  // ADR-20260610-01 / #1492: `stroke-style` is the canonical edge-side
  // line-style property; `border-style` stays as the edge alias.
  describe("stroke-style property (edges)", () => {
    function resolveEdgeWith(rules: StyleRule[]) {
      const system = makeNode({
        kind: "system",
        id: "Test",
        children: [
          makeNode({ kind: "service", id: "A", label: "A" }),
          makeNode({ kind: "service", id: "B", label: "B" }),
        ],
        edges: [{ from: "A", to: "B", kind: "sync" as const, tags: [], loc: dummyLoc }],
      });
      const result = resolveStyles([system], [getBuiltinStyleSheet(), { rules }]);
      return result.edges.get("A->B")!;
    }

    it("stroke-style sets the edge line style", () => {
      const edgeStyle = resolveEdgeWith([
        makeRule(
          { nodeType: "edge", tags: [], annotations: [] },
          { "stroke-style": "dotted" },
          1,
          0,
        ),
      ]);
      expect(edgeStyle.strokeStyle).toBe("dotted");
    });

    it("stroke-style wins over border-style in the same rule", () => {
      const edgeStyle = resolveEdgeWith([
        makeRule(
          { nodeType: "edge", tags: [], annotations: [] },
          { "border-style": "dotted", "stroke-style": "dashed" },
          1,
          0,
        ),
      ]);
      expect(edgeStyle.strokeStyle).toBe("dashed");
    });

    it("stroke-style wins even when border-style is declared later in the cascade", () => {
      const edgeStyle = resolveEdgeWith([
        makeRule(
          { nodeType: "edge", tags: [], annotations: [] },
          { "stroke-style": "dashed" },
          1,
          0,
        ),
        makeRule(
          { nodeType: "edge", tags: [], annotations: [] },
          { "border-style": "dotted" },
          1,
          1,
        ),
      ]);
      expect(edgeStyle.strokeStyle).toBe("dashed");
    });

    it("an invalid stroke-style value is ignored and border-style applies", () => {
      const edgeStyle = resolveEdgeWith([
        makeRule(
          { nodeType: "edge", tags: [], annotations: [] },
          { "border-style": "dotted", "stroke-style": "wavy" },
          1,
          0,
        ),
      ]);
      expect(edgeStyle.strokeStyle).toBe("dotted");
    });
  });
});

describe("analyze", () => {
  it("detects domain dispersal", () => {
    const file = makeFile({
      systems: [
        makeNode({
          kind: "system",
          id: "Test",
          children: [
            makeNode({
              kind: "service",
              id: "EC",
              label: "EC",
              children: [makeNode({ kind: "domain", id: "Order", label: "受注" })],
            }),
            makeNode({
              kind: "service",
              id: "Legacy",
              label: "Legacy",
              children: [makeNode({ kind: "domain", id: "Order", label: "受注（旧）" })],
            }),
          ],
        }),
      ] as KrsFile["systems"],
    });
    const warnings = analyze(file, []);
    const dispersal = warnings.find((w) => w.kind === "domain-dispersal");
    if (!dispersal || dispersal.kind !== "domain-dispersal") {
      throw new Error("expected a domain-dispersal warning");
    }
    expect(dispersal.params.domainId).toBe("Order");
  });

  it("detects missing runtime", () => {
    const file = makeFile({
      deploys: [
        {
          id: "prod",
          label: "prod",
          nodes: [
            {
              kind: "oci" as const,
              id: "my-service",
              properties: { realizes: ["Svc"] },
              loc: dummyLoc,
            },
          ],
          loc: dummyLoc,
        },
      ],
    });
    const warnings = analyze(file, []);
    expect(warnings.some((w) => w.kind === "missing-runtime")).toBe(true);
  });

  it("detects missing realizes", () => {
    const file = makeFile({
      deploys: [
        {
          id: "prod",
          label: "prod",
          nodes: [
            {
              kind: "oci" as const,
              id: "my-service",
              properties: { runtime: "Node.js 20" },
              loc: dummyLoc,
            },
          ],
          loc: dummyLoc,
        },
      ],
    });
    const warnings = analyze(file, []);
    expect(warnings.some((w) => w.kind === "missing-realizes")).toBe(true);
  });

  it("detects style conflicts across user sheets", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet1: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#AAA" }, 1)],
    };
    const userSheet2: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#BBB" }, 1)],
    };
    const file = makeFile({});
    const warnings = analyze(file, [builtin, userSheet1, userSheet2]);
    expect(warnings.some((w) => w.kind === "style-conflict")).toBe(true);
  });

  it("does not warn when user sheet overrides builtin", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#AAA" }, 1)],
    };
    const file = makeFile({});
    const warnings = analyze(file, [builtin, userSheet]);
    expect(warnings.some((w) => w.kind === "style-conflict")).toBe(false);
  });

  it("does not warn when icon theme sheet and user sheet define the same selector (systemSheetCount=2)", () => {
    // When icon mode is active, the icon theme is a system sheet at index 1.
    // A user sheet at index 2 may also set the same selector (e.g. service color).
    // This must NOT produce a style-conflict warning.
    const builtin = getBuiltinStyleSheet();
    const iconThemeSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "service", tags: [], annotations: [] },
          { shape: 'url("service")' },
          0,
        ),
      ],
    };
    const userSheet: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#AAA" }, 1)],
    };
    const file = makeFile({});
    const warnings = analyze(file, [builtin, iconThemeSheet, userSheet], 2);
    expect(warnings.some((w) => w.kind === "style-conflict")).toBe(false);
  });

  it("still warns when two user sheets conflict even with icon theme present (systemSheetCount=2)", () => {
    const builtin = getBuiltinStyleSheet();
    const iconThemeSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "service", tags: [], annotations: [] },
          { shape: 'url("service")' },
          0,
        ),
      ],
    };
    const userSheet1: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#AAA" }, 1)],
    };
    const userSheet2: StyleSheet = {
      rules: [makeRule({ nodeType: "service", tags: [], annotations: [] }, { color: "#BBB" }, 2)],
    };
    const file = makeFile({});
    const warnings = analyze(file, [builtin, iconThemeSheet, userSheet1, userSheet2], 2);
    expect(warnings.some((w) => w.kind === "style-conflict")).toBe(true);
  });
});

describe("resolveStyles with deployNodes", () => {
  function makeDeployUnit(kind: DeployNode["kind"], id: string): DeployNode {
    return { kind, id, properties: {}, loc: dummyLoc };
  }

  it("resolves oci deploy node style from builtin sheet", () => {
    const builtin = getBuiltinStyleSheet();
    const unit = makeDeployUnit("oci", "order-api");
    const result = resolveStyles([], [builtin], [unit]);
    const style = result.nodes.get("order-api")!;
    expect(style.backgroundColor).toBe("#1E3A5F");
    expect(style.borderColor).toBe("#3B82F6");
    expect(style.badgeLabel).toBe("oci");
  });

  it("resolves lambda deploy node style from builtin sheet", () => {
    const builtin = getBuiltinStyleSheet();
    const unit = makeDeployUnit("lambda", "payment-fn");
    const result = resolveStyles([], [builtin], [unit]);
    const style = result.nodes.get("payment-fn")!;
    expect(style.backgroundColor).toBe("#3B1F5F");
    expect(style.borderColor).toBe("#A855F7");
    expect(style.badgeLabel).toBe("lambda");
  });

  it("allows user stylesheet to override deploy node color", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "oci", tags: [], annotations: [] },
          { "background-color": "#FF0000" },
          1,
        ),
      ],
    };
    const unit = makeDeployUnit("oci", "my-container");
    const result = resolveStyles([], [builtin, userSheet], [unit]);
    expect(result.nodes.get("my-container")!.backgroundColor).toBe("#FF0000");
  });

  it("does not include deploy nodes in nodes map when deployNodes is omitted", () => {
    const builtin = getBuiltinStyleSheet();
    const result = resolveStyles([], [builtin]);
    expect(result.nodes.has("order-api")).toBe(false);
  });
});

describe("resolveStyles with organizations", () => {
  function makeTeam(
    id: string,
    members: string[] = [],
    subTeams: TeamNode[] = [],
    annotations: string[] = [],
  ): TeamNode {
    return {
      kind: "team",
      id,
      annotations,
      properties: { links: [], owns: [] },
      children: [
        ...members.map(
          (mid): MemberNode => ({
            kind: "member",
            id: mid,
            properties: { links: [] },
            children: [],
            loc: dummyLoc,
          }),
        ),
        ...subTeams,
      ],
      loc: dummyLoc,
    };
  }

  function makeOrg(id: string, teams: TeamNode[]): OrganizationBlock {
    return { id, properties: { links: [] }, teams, loc: dummyLoc };
  }

  it("resolves team node style from builtin sheet", () => {
    const builtin = getBuiltinStyleSheet();
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const result = resolveStyles([], [builtin], undefined, [org]);
    const style = result.nodes.get("backend")!;
    expect(style.backgroundColor).toBe("#065F46");
    expect(style.borderColor).toBe("#047857");
  });

  it("resolves member node style from builtin sheet", () => {
    const builtin = getBuiltinStyleSheet();
    const org = makeOrg("Corp", [makeTeam("backend", ["alice"])]);
    const result = resolveStyles([], [builtin], undefined, [org]);
    const style = result.nodes.get("alice")!;
    expect(style.backgroundColor).toBe("#1E3A5F");
    expect(style.shape).toBe("user");
  });

  it("allows user stylesheet to override team color", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "team", tags: [], annotations: [] },
          { "background-color": "#FF0000" },
          1,
        ),
      ],
    };
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const result = resolveStyles([], [builtin, userSheet], undefined, [org]);
    expect(result.nodes.get("backend")!.backgroundColor).toBe("#FF0000");
  });

  it("does not apply team style to member nodes", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "team", tags: [], annotations: [] },
          { "background-color": "#FF0000" },
          1,
        ),
      ],
    };
    const org = makeOrg("Corp", [makeTeam("backend", ["alice"])]);
    const result = resolveStyles([], [builtin, userSheet], undefined, [org]);
    // member should keep its own builtin color, not the team override
    expect(result.nodes.get("alice")!.backgroundColor).toBe("#1E3A5F");
  });

  it("resolves a migration badge for a @migration_target team", () => {
    const builtin = getBuiltinStyleSheet();
    const org = makeOrg("Corp", [makeTeam("modern", [], [], ["migration_target"])]);
    const result = resolveStyles([], [builtin], undefined, [org]);
    const style = result.nodes.get("modern")!;
    // The builtin `@migration_target { badge-icon: "→"; ... }` rule must reach
    // org teams now that orgNodeSelectorMatches honors annotation selectors (#1583).
    expect(style.badgeIcon).toBe("→");
    expect(style.badgeLabel).toBeTruthy();
  });

  it("does not resolve a badge for an unannotated team", () => {
    const builtin = getBuiltinStyleSheet();
    const org = makeOrg("Corp", [makeTeam("plain")]);
    const result = resolveStyles([], [builtin], undefined, [org]);
    expect(result.nodes.get("plain")!.badgeIcon).toBeUndefined();
  });

  it("does not include org nodes when organizations is omitted", () => {
    const builtin = getBuiltinStyleSheet();
    const result = resolveStyles([], [builtin]);
    expect(result.nodes.has("backend")).toBe(false);
  });

  it("collects nodes from multiple organizations", () => {
    const builtin = getBuiltinStyleSheet();
    const org1 = makeOrg("Corp1", [makeTeam("backend")]);
    const org2 = makeOrg("Corp2", [makeTeam("frontend")]);
    const result = resolveStyles([], [builtin], undefined, [org1, org2]);
    expect(result.nodes.has("backend")).toBe(true);
    expect(result.nodes.has("frontend")).toBe(true);
  });

  it("ID selector overrides type selector for org nodes", () => {
    const builtin = getBuiltinStyleSheet();
    const userSheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "team", tags: [], annotations: [] },
          { "background-color": "#111111" },
          1,
        ),
        makeRule(
          { id: "backend", tags: [], annotations: [] },
          { "background-color": "#222222" },
          100,
        ),
      ],
    };
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const result = resolveStyles([], [builtin, userSheet], undefined, [org]);
    expect(result.nodes.get("backend")!.backgroundColor).toBe("#222222");
  });
});

describe("resource tag auto-inference in resolveStyles", () => {
  function makeSystem(infraChildren: KrsNode[], serviceChildren: KrsNode[]): KrsNode {
    return makeNode({
      kind: "system",
      id: "ECPlatform",
      children: [...infraChildren, ...serviceChildren],
    });
  }

  function makeInfraNode(
    kind: "database" | "queue" | "storage",
    id: string,
    subKind: string,
    subId: string,
  ): KrsNode {
    const sub = makeNode({ kind: subKind as KrsNode["kind"], id: subId });
    return makeNode({ kind, id, children: [sub] });
  }

  function makeResourceNode(id: string, ref?: { parent: string; child: string }): KrsNode {
    return makeNode({ kind: "resource", id, ref } as Partial<KrsNode> & {
      kind: KrsNode["kind"];
      id: string;
    });
  }

  it("infers table tag for resource referencing a database table", () => {
    const db = makeInfraNode("database", "OrderDB", "table", "OrderTable");
    const resource = makeResourceNode("OrderDB.OrderTable", {
      parent: "OrderDB",
      child: "OrderTable",
    });
    const system = makeSystem(
      [db],
      [
        makeNode({
          kind: "service",
          id: "Svc",
          children: [
            makeNode({
              kind: "domain",
              id: "D",
              children: [makeNode({ kind: "usecase", id: "UC", children: [resource] })],
            }),
          ],
        }),
      ],
    );
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "resource", tags: ["table"], annotations: [] },
          { "background-color": "#TABLE" },
          1,
        ),
        makeRule(
          { nodeType: "resource", tags: [], annotations: [] },
          { "background-color": "#RESOURCE" },
          0,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    // The resource should match resource[table], not the generic resource rule
    expect(result.nodes.get("OrderDB.OrderTable")!.backgroundColor).toBe("#TABLE");
  });

  it("infers queue tag for resource referencing a queue item", () => {
    const q = makeInfraNode("queue", "EventBus", "queue-item", "OrderCreated");
    const resource = makeResourceNode("EventBus.OrderCreated", {
      parent: "EventBus",
      child: "OrderCreated",
    });
    const system = makeSystem(
      [q],
      [
        makeNode({
          kind: "service",
          id: "Svc",
          children: [makeNode({ kind: "usecase", id: "UC", children: [resource] })],
        }),
      ],
    );
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "resource", tags: ["queue"], annotations: [] },
          { "background-color": "#QUEUE" },
          1,
        ),
        makeRule(
          { nodeType: "resource", tags: [], annotations: [] },
          { "background-color": "#RESOURCE" },
          0,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("EventBus.OrderCreated")!.backgroundColor).toBe("#QUEUE");
  });

  it("migration coexistence: same domain ID with different annotations resolves independent styles", () => {
    // Reproduces the style-map collision in issue #505:
    // Contract @deprecated and Contract @migration_target share the same ID but must each
    // get their own style entry so the wrong badge does not bleed across nodes.
    const deprecatedDomain = makeNode({
      kind: "domain",
      id: "Contract",
      annotations: ["deprecated"],
    });
    const migrationTargetDomain = makeNode({
      kind: "domain",
      id: "Contract",
      annotations: ["migration_target"],
    });
    const legacyService = makeNode({
      kind: "service",
      id: "LegacyService",
      children: [deprecatedDomain],
    });
    const newService = makeNode({
      kind: "service",
      id: "NewService",
      children: [migrationTargetDomain],
    });
    const system = makeNode({
      kind: "system",
      id: "OrderSystem",
      children: [legacyService, newService],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ tags: [], annotations: ["deprecated"] }, { "badge-label": '"廃止予定"' }, 10, 0),
        makeRule(
          { tags: [], annotations: ["migration_target"] },
          { "badge-label": '"移行先"' },
          10,
          1,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    // Each domain must retain its own annotation-qualified style
    const deprecatedStyle = result.nodes.get(nodeStyleKey("Contract", ["deprecated"]));
    const migrationStyle = result.nodes.get(nodeStyleKey("Contract", ["migration_target"]));
    expect(deprecatedStyle?.badgeLabel).toBe("廃止予定");
    expect(migrationStyle?.badgeLabel).toBe("移行先");
  });

  it("does not override explicit tags on resource nodes", () => {
    const db = makeInfraNode("database", "OrderDB", "table", "OrderTable");
    const resource = {
      ...makeResourceNode("OrderDB.OrderTable", { parent: "OrderDB", child: "OrderTable" }),
      tags: ["custom"],
    };
    const system = makeSystem(
      [db],
      [makeNode({ kind: "service", id: "Svc", children: [resource] })],
    );
    const sheet: StyleSheet = {
      rules: [
        makeRule(
          { nodeType: "resource", tags: ["table"], annotations: [] },
          { "background-color": "#TABLE" },
          1,
        ),
        makeRule(
          { nodeType: "resource", tags: ["custom"], annotations: [] },
          { "background-color": "#CUSTOM" },
          1,
        ),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.nodes.get("OrderDB.OrderTable")!.backgroundColor).toBe("#CUSTOM");
  });
});

describe("nodeStyleKey", () => {
  it("returns plain id when annotations is empty", () => {
    expect(nodeStyleKey("Contract", [])).toBe("Contract");
  });

  it("returns plain id when annotations is undefined", () => {
    expect(nodeStyleKey("Contract", undefined)).toBe("Contract");
  });

  it("appends sorted annotations separated by comma", () => {
    expect(nodeStyleKey("Contract", ["deprecated"])).toBe("Contract@deprecated");
    expect(nodeStyleKey("Contract", ["migration_target"])).toBe("Contract@migration_target");
  });

  it("sorts multiple annotations for stable keys", () => {
    expect(nodeStyleKey("X", ["b", "a"])).toBe("X@a,b");
    expect(nodeStyleKey("X", ["a", "b"])).toBe("X@a,b");
  });
});

describe("resolveStyles — column layout hint (#969)", () => {
  function nodeWithColumn(value: string): {
    system: KrsNode;
    sheet: StyleSheet;
  } {
    const system = makeNode({
      kind: "system",
      id: "S",
      children: [makeNode({ kind: "service", id: "Admin", tags: ["external"] })],
    });
    const sheet: StyleSheet = {
      rules: [makeRule({ id: "Admin", tags: [], annotations: [] }, { column: value }, 100)],
    };
    return { system, sheet };
  }

  it("populates layoutHints for valid values", () => {
    for (const value of ["left", "center", "right"] as const) {
      const { system, sheet } = nodeWithColumn(value);
      const result = resolveStyles([system], [sheet]);
      expect(result.layoutHints.get("Admin")).toEqual({ column: value });
      expect(result.warnings).toEqual([]);
    }
  });

  it("emits style-column-invalid-value and skips the hint when the value is unknown", () => {
    const { system, sheet } = nodeWithColumn("middle");
    const result = resolveStyles([system], [sheet]);
    expect(result.layoutHints.has("Admin")).toBe(false);
    expect(result.warnings).toEqual([
      { kind: "style-column-invalid-value", nodeId: "Admin", value: "middle" },
    ]);
  });

  it("honors cascade: id selector overrides kind selector", () => {
    const system = makeNode({
      kind: "system",
      id: "S",
      children: [makeNode({ kind: "service", id: "Admin" })],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ nodeType: "service", tags: [], annotations: [] }, { column: "left" }, 1),
        makeRule({ id: "Admin", tags: [], annotations: [] }, { column: "right" }, 100),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.layoutHints.get("Admin")).toEqual({ column: "right" });
  });

  it("honors cascade: same specificity → declaration order, last wins", () => {
    const system = makeNode({
      kind: "system",
      id: "S",
      children: [makeNode({ kind: "service", id: "Admin" })],
    });
    const sheet: StyleSheet = {
      rules: [
        makeRule({ id: "Admin", tags: [], annotations: [] }, { column: "left" }, 100, 0),
        makeRule({ id: "Admin", tags: [], annotations: [] }, { column: "right" }, 100, 1),
      ],
    };
    const result = resolveStyles([system], [sheet]);
    expect(result.layoutHints.get("Admin")).toEqual({ column: "right" });
  });

  it("warns when a column hint resolves on a deploy node", () => {
    const system = makeNode({ kind: "system", id: "S", children: [] });
    const deployUnit: DeployNode = {
      kind: "oci",
      id: "ecommerceApp",
      label: "ecommerce-app",
      properties: { runtime: "GKE", realizes: [] },
      loc: dummyLoc,
    };
    const sheet: StyleSheet = {
      rules: [makeRule({ id: "ecommerceApp", tags: [], annotations: [] }, { column: "left" }, 100)],
    };
    const result = resolveStyles([system], [sheet], [deployUnit]);
    expect(result.layoutHints.has("ecommerceApp")).toBe(false);
    expect(result.warnings).toContainEqual({
      kind: "style-column-ignored-non-system-view",
      nodeId: "ecommerceApp",
      viewType: "deploy",
    });
  });

  it("emits style-column-invalid-value for invalid values on deploy nodes (not silently dropped)", () => {
    const system = makeNode({ kind: "system", id: "S", children: [] });
    const deployUnit: DeployNode = {
      kind: "oci",
      id: "ecommerceApp",
      label: "ecommerce-app",
      properties: { runtime: "GKE", realizes: [] },
      loc: dummyLoc,
    };
    const sheet: StyleSheet = {
      rules: [
        makeRule({ id: "ecommerceApp", tags: [], annotations: [] }, { column: "middel" }, 100),
      ],
    };
    const result = resolveStyles([system], [sheet], [deployUnit]);
    expect(result.warnings).toContainEqual({
      kind: "style-column-invalid-value",
      nodeId: "ecommerceApp",
      value: "middel",
    });
  });

  it("warns when a column hint resolves on an org team node", () => {
    const system = makeNode({ kind: "system", id: "S", children: [] });
    const team: TeamNode = {
      kind: "team",
      id: "platform",
      label: "Platform",
      annotations: [],
      children: [],
      properties: { owns: [], links: [] },
      loc: dummyLoc,
    };
    const orgs: OrganizationBlock[] = [
      { id: "Org", label: "Org", teams: [team], loc: dummyLoc, properties: { links: [] } },
    ];
    const sheet: StyleSheet = {
      rules: [makeRule({ id: "platform", tags: [], annotations: [] }, { column: "right" }, 100)],
    };
    const result = resolveStyles([system], [sheet], undefined, orgs);
    expect(result.warnings).toContainEqual({
      kind: "style-column-ignored-non-system-view",
      nodeId: "platform",
      viewType: "org",
    });
  });
});

describe("resolveStyles — grid-columns layout hint (#1737)", () => {
  function systemWithGridColumns(value: string): { system: KrsNode; sheet: StyleSheet } {
    const system = makeNode({
      kind: "system",
      id: "S",
      children: [makeNode({ kind: "service", id: "Svc" })],
    });
    const sheet: StyleSheet = {
      rules: [makeRule({ id: "S", tags: [], annotations: [] }, { "grid-columns": value }, 100)],
    };
    return { system, sheet };
  }

  it("populates layoutHints.gridColumns for a positive integer", () => {
    const { system, sheet } = systemWithGridColumns("3");
    const result = resolveStyles([system], [sheet]);
    expect(result.layoutHints.get("S")).toEqual({ gridColumns: 3 });
    expect(result.warnings).toEqual([]);
  });

  it("emits style-grid-columns-invalid-value and skips the hint for non-positive / non-integer", () => {
    for (const value of ["0", "-2", "2.5", "abc"]) {
      const { system, sheet } = systemWithGridColumns(value);
      const result = resolveStyles([system], [sheet]);
      expect(result.layoutHints.has("S")).toBe(false);
      expect(result.warnings).toContainEqual({
        kind: "style-grid-columns-invalid-value",
        nodeId: "S",
        value,
      });
    }
  });

  it("is honored on deploy nodes (stored, no ignored-view warning)", () => {
    const system = makeNode({ kind: "system", id: "S", children: [] });
    const deployNodes: DeployNode[] = [{ kind: "oci", id: "unit", properties: {}, loc: dummyLoc }];
    const sheet: StyleSheet = {
      rules: [makeRule({ id: "unit", tags: [], annotations: [] }, { "grid-columns": "4" }, 100)],
    };
    const result = resolveStyles([system], [sheet], deployNodes);
    expect(result.layoutHints.get("unit")).toEqual({ gridColumns: 4 });
    expect(result.warnings.some((w) => w.kind === "style-column-ignored-non-system-view")).toBe(
      false,
    );
  });
});
