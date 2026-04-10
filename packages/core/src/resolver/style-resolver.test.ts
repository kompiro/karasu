import { describe, it, expect } from "vitest";
import { resolveStyles } from "./style-resolver.js";
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
    domains: [],
    deploys: [],
    organizations: [],
    ownerIndex: new Map(),
    nodePathIndex: new Map(),
    nodeFileIndex: new Map(),
    ...overrides,
  };
}

function makeRule(
  selector: StyleRule["selector"],
  properties: Record<string, string>,
  specificity: number,
  sourceIndex = 0,
): StyleRule {
  return { selector, properties, specificity, sourceIndex };
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
    expect(warnings.some((w) => w.kind === "domain-dispersal")).toBe(true);
    expect(warnings[0].message).toContain("Order");
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
  function makeTeam(id: string, members: string[] = [], subTeams: TeamNode[] = []): TeamNode {
    return {
      kind: "team",
      id,
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
