import { describe, it, expect } from "vitest";
import { resolveStyles } from "./style-resolver.js";
import { analyze } from "./warnings.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import type { KrsNode, KrsFile } from "../types/ast.js";
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
    deploys: [],
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
              children: [makeNode({ kind: "domain", id: "Order2", label: "受注" })],
            }),
          ],
        }),
      ] as KrsFile["systems"],
    });
    const warnings = analyze(file, []);
    expect(warnings.some((w) => w.kind === "domain-dispersal")).toBe(true);
    expect(warnings[0].message).toContain("受注");
  });

  it("detects missing runtime", () => {
    const file = makeFile({
      deploys: [
        {
          label: "prod",
          nodes: [
            {
              kind: "oci" as const,
              id: "my-service",
              properties: { realizes: "Svc" },
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
});
