import { describe, it, expect } from "vitest";
import { StyleParser, computeSpecificity } from "./style-parser.js";
import type { ValueNode } from "../types/value-node.js";

describe("StyleParser", () => {
  it("parses empty input", () => {
    const result = StyleParser.parse("");
    expect(result.value.rules).toHaveLength(0);
  });

  it("parses a type selector", () => {
    const result = StyleParser.parse(`
service {
  background-color: #1D4ED8;
  color: #DBEAFE;
}
    `);
    expect(result.value.rules).toHaveLength(1);
    const rule = result.value.rules[0];
    expect(rule.selector.nodeType).toBe("service");
    expect(rule.properties["background-color"]).toBe("#1D4ED8");
    expect(rule.properties["color"]).toBe("#DBEAFE");
  });

  it("parses a tag selector", () => {
    const result = StyleParser.parse(`
[external] {
  border-style: dashed;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.tags).toEqual(["external"]);
    expect(rule.properties["border-style"]).toBe("dashed");
  });

  it("parses an annotation selector", () => {
    const result = StyleParser.parse(`
@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  opacity: 0.6;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.annotations).toEqual(["deprecated"]);
    expect(rule.properties["badge-color"]).toBe("#EF4444");
    expect(rule.properties["badge-icon"]).toBe('"⚠"');
    expect(rule.properties["opacity"]).toBe("0.6");
  });

  it("parses a composite selector (type + tag)", () => {
    const result = StyleParser.parse(`
service[external] {
  color: #9CA3AF;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.nodeType).toBe("service");
    expect(rule.selector.tags).toEqual(["external"]);
  });

  it("parses a composite selector (tag + annotation)", () => {
    const result = StyleParser.parse(`
[external]@deprecated {
  border-color: #EF4444;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.tags).toEqual(["external"]);
    expect(rule.selector.annotations).toEqual(["deprecated"]);
  });

  it("parses an ID selector", () => {
    const result = StyleParser.parse(`
#ECommerce {
  background-color: #7C3AED;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.id).toBe("ECommerce");
    expect(rule.properties["background-color"]).toBe("#7C3AED");
  });

  it("parses edge selector", () => {
    const result = StyleParser.parse(`
edge {
  color: #94A3B8;
  stroke-width: 1.5px;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.nodeType).toBe("edge");
    expect(rule.properties["stroke-width"]).toBe("1.5px");
  });

  it("parses edge with tag selector", () => {
    const result = StyleParser.parse(`
edge[async] {
  border-style: dashed;
}
    `);
    const rule = result.value.rules[0];
    expect(rule.selector.nodeType).toBe("edge");
    expect(rule.selector.tags).toEqual(["async"]);
  });

  describe("edge#<id> selector", () => {
    it("parses an edge selector with an author id", () => {
      const result = StyleParser.parse(`
edge#criticalWrite {
  color: #EF4444;
}
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.nodeType).toBe("edge");
      expect(rule.selector.edgeId).toBe("criticalWrite");
    });

    it("parses an edge selector with a sync base id", () => {
      const result = StyleParser.parse(`
edge#A->B {
  color: #EF4444;
}
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.nodeType).toBe("edge");
      expect(rule.selector.edgeId).toBe("A->B");
    });

    it("parses an edge selector with an async base id", () => {
      const result = StyleParser.parse(`
edge#A-->B {
  color: #EF4444;
}
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.nodeType).toBe("edge");
      expect(rule.selector.edgeId).toBe("A-->B");
    });

    it("combines edge id with a tag selector", () => {
      const result = StyleParser.parse(`
edge#criticalWrite[write] {
  color: #EF4444;
}
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.edgeId).toBe("criticalWrite");
      expect(rule.selector.tags).toEqual(["write"]);
    });

    it("parses an edge selector with dot-notation in the base id (usecase->resource synthesized edges)", () => {
      const result = StyleParser.parse(`
edge#SearchProducts->ECommerceDB.ProductTable {
  direction: down;
}
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.nodeType).toBe("edge");
      expect(rule.selector.edgeId).toBe("SearchProducts->ECommerceDB.ProductTable");
      expect(rule.properties["direction"]).toBe("down");
    });

    it("parses an edge selector with dot-notation on the source side", () => {
      const result = StyleParser.parse(`
edge#OrderDB.OrderTable->Logger { color: #EF4444; }
      `);
      const rule = result.value.rules[0];
      expect(rule.selector.edgeId).toBe("OrderDB.OrderTable->Logger");
    });
  });

  it("parses grouped selectors", () => {
    const result = StyleParser.parse(`
service, domain {
  border-radius: 8px;
}
    `);
    expect(result.value.rules).toHaveLength(2);
    expect(result.value.rules[0].selector.nodeType).toBe("service");
    expect(result.value.rules[1].selector.nodeType).toBe("domain");
    // Both should have the same properties
    expect(result.value.rules[0].properties["border-radius"]).toBe("8px");
    expect(result.value.rules[1].properties["border-radius"]).toBe("8px");
  });

  it("parses shape property", () => {
    const result = StyleParser.parse(`
user {
  shape: user;
}
    `);
    expect(result.value.rules[0].properties["shape"]).toBe("user");
  });

  it("parses shape url value", () => {
    const result = StyleParser.parse(`
service {
  shape: url("shapes/cloud.svg");
}
    `);
    expect(result.value.rules[0].properties["shape"]).toBe('url("shapes/cloud.svg")');
  });

  it("parses font-family with comma-separated values", () => {
    const result = StyleParser.parse(`
service {
  font-family: "Noto Sans JP", sans-serif;
}
    `);
    expect(result.value.rules[0].properties["font-family"]).toBe('"Noto Sans JP" , sans-serif');
  });

  it("handles comments", () => {
    const result = StyleParser.parse(`
/* Node styles */
service {
  // Primary color
  color: #DBEAFE;
}
    `);
    expect(result.value.rules).toHaveLength(1);
    expect(result.value.rules[0].properties["color"]).toBe("#DBEAFE");
  });

  it("parses multiple rule sets", () => {
    const result = StyleParser.parse(`
service {
  background-color: #0369A1;
}
domain {
  background-color: #15803D;
}
[external] {
  border-style: dashed;
}
    `);
    expect(result.value.rules).toHaveLength(3);
  });
});

describe("StyleParser AST shape (Phase 1)", () => {
  it("attaches a SourceRange to each rule, selector, and declaration", () => {
    const result = StyleParser.parse(`service {\n  color: #DBEAFE;\n}\n`);
    const rule = result.value.rules[0];
    expect(rule.loc.start.line).toBeGreaterThan(0);
    expect(rule.loc.end.offset).toBeGreaterThan(rule.loc.start.offset);
    expect(rule.selector.loc.start.line).toBeGreaterThan(0);
    expect(rule.declarationLocs["color"]).toBeDefined();
    expect(rule.declarationLocs["color"].start.offset).toBeGreaterThan(
      rule.selector.loc.end.offset,
    );
  });

  it("uses `<anonymous>` as the default sheetId", () => {
    const result = StyleParser.parse(`service { color: red; }`);
    expect(result.value.sheetId).toBe("<anonymous>");
    expect(result.value.rules[0].sheetId).toBe("<anonymous>");
  });

  it("threads an explicit sheetId through every rule", () => {
    const result = StyleParser.parse(`service { color: red; }`, "/project/site.krs.style");
    expect(result.value.sheetId).toBe("/project/site.krs.style");
    expect(result.value.rules[0].sheetId).toBe("/project/site.krs.style");
  });
});

describe("StyleParser comma-as-separator recovery (#1168)", () => {
  it("emits an error and recovers when `,` is used between properties", () => {
    const result = StyleParser.parse(`edge#A->B { color: red, direction: down; }`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("expected-semicolon-between-properties");
    expect(errors[0].params).toEqual({ property: "color" });
    expect(result.value.rules[0].properties).toEqual({
      color: "red",
      direction: "down",
    });
  });

  it("emits one diagnostic per misplaced comma", () => {
    const result = StyleParser.parse(`service { a: 1, b: 2, c: 3; }`);
    const errors = result.diagnostics.filter(
      (d) => d.code === "expected-semicolon-between-properties",
    );
    expect(errors).toHaveLength(2);
    expect(result.value.rules[0].properties).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("does not flag legitimate comma-separated values like font-family", () => {
    const result = StyleParser.parse(`service { font-family: "Noto", sans-serif; }`);
    const errors = result.diagnostics.filter(
      (d) => d.code === "expected-semicolon-between-properties",
    );
    expect(errors).toHaveLength(0);
    expect(result.value.rules[0].properties["font-family"]).toBe('"Noto" , sans-serif');
  });
});

describe("computeSpecificity", () => {
  it("type selector = 1", () => {
    expect(computeSpecificity({ nodeType: "service", tags: [], annotations: [] })).toBe(1);
  });

  it("tag selector = 10", () => {
    expect(computeSpecificity({ tags: ["external"], annotations: [] })).toBe(10);
  });

  it("annotation selector = 10", () => {
    expect(computeSpecificity({ tags: [], annotations: ["deprecated"] })).toBe(10);
  });

  it("type + tag = 11", () => {
    expect(
      computeSpecificity({
        nodeType: "service",
        tags: ["external"],
        annotations: [],
      }),
    ).toBe(11);
  });

  it("tag + annotation = 20", () => {
    expect(computeSpecificity({ tags: ["external"], annotations: ["deprecated"] })).toBe(20);
  });

  it("id = 100", () => {
    expect(computeSpecificity({ id: "ECommerce", tags: [], annotations: [] })).toBe(100);
  });

  it("edge id = 100, edge#<id> with type = 101", () => {
    expect(computeSpecificity({ edgeId: "criticalWrite", tags: [], annotations: [] })).toBe(100);
    expect(
      computeSpecificity({
        nodeType: "edge",
        edgeId: "criticalWrite",
        tags: [],
        annotations: [],
      }),
    ).toBe(101);
  });
});

describe("StyleParser trivia preservation (Phase 2)", () => {
  it("attaches a leading block comment to the rule that follows", () => {
    const result = StyleParser.parse(`/* heading */\nservice { color: red; }\n`);
    const rule = result.value.rules[0];
    expect(rule.leadingTrivia).toHaveLength(1);
    expect(rule.leadingTrivia![0].kind).toBe("block-comment");
    expect(rule.leadingTrivia![0].text).toBe("/* heading */");
  });

  it("attaches a leading line comment to the rule that follows", () => {
    const result = StyleParser.parse(`// note\nservice { color: red; }\n`);
    const rule = result.value.rules[0];
    expect(rule.leadingTrivia).toHaveLength(1);
    expect(rule.leadingTrivia![0].kind).toBe("line-comment");
    expect(rule.leadingTrivia![0].text).toBe("// note");
  });

  it("attaches a same-line trailing block comment to a declaration", () => {
    const result = StyleParser.parse(`service { color: red; /* primary */ }\n`);
    const rule = result.value.rules[0];
    expect(rule.declarationTrivia?.color?.trailing).toHaveLength(1);
    expect(rule.declarationTrivia?.color?.trailing[0].kind).toBe("block-comment");
    expect(rule.declarationTrivia?.color?.trailing[0].text).toBe("/* primary */");
  });

  it("attaches a same-line trailing line comment to a declaration", () => {
    const result = StyleParser.parse(`service { color: red; // primary\n}\n`);
    const rule = result.value.rules[0];
    expect(rule.declarationTrivia?.color?.trailing).toHaveLength(1);
    expect(rule.declarationTrivia?.color?.trailing[0].kind).toBe("line-comment");
    expect(rule.declarationTrivia?.color?.trailing[0].text).toBe("// primary");
  });

  it("attaches a leading comment between declarations to the next declaration", () => {
    const result = StyleParser.parse(
      `service {\n  color: red;\n  // group: visual\n  background-color: blue;\n}\n`,
    );
    const rule = result.value.rules[0];
    expect(rule.declarationTrivia?.color?.trailing).toEqual([]);
    expect(rule.declarationTrivia?.["background-color"]?.leading).toHaveLength(1);
    expect(rule.declarationTrivia?.["background-color"]?.leading[0].text).toBe("// group: visual");
  });

  it("preserves a blank line between rules as Trivia on the next rule", () => {
    const result = StyleParser.parse(`service { color: red; }\n\nedge { color: blue; }\n`);
    const second = result.value.rules[1];
    const blankLineTrivia = (second.leadingTrivia ?? []).filter((t) => t.kind === "blank-line");
    expect(blankLineTrivia.length).toBeGreaterThan(0);
  });

  it("collapses multiple consecutive blank lines into a single blank-line trivia", () => {
    const result = StyleParser.parse(`service { color: red; }\n\n\n\nedge { color: blue; }\n`);
    const second = result.value.rules[1];
    const blankLineTrivia = (second.leadingTrivia ?? []).filter((t) => t.kind === "blank-line");
    expect(blankLineTrivia).toHaveLength(1);
  });

  it("captures trivia between the last `;` and `}` as the last declaration's trailing", () => {
    const result = StyleParser.parse(`service {\n  color: red;\n  // tail note\n}\n`);
    const rule = result.value.rules[0];
    const trailing = rule.declarationTrivia?.color?.trailing ?? [];
    expect(trailing.some((t) => t.text === "// tail note")).toBe(true);
  });

  it("preserves trailing trivia after the file's last rule on the sheet", () => {
    const result = StyleParser.parse(`service { color: red; }\n/* footer */\n`);
    expect(result.value.trailingTrivia).toBeDefined();
    expect(result.value.trailingTrivia!.some((t) => t.text === "/* footer */")).toBe(true);
  });

  it("does not duplicate trivia across grouped selectors", () => {
    // `a, b { ... }` expands into two rules, but the leading comment must
    // attach to only the first.
    const result = StyleParser.parse(`/* shared */\nservice, edge { color: red; }\n`);
    expect(result.value.rules[0].leadingTrivia).toHaveLength(1);
    expect(result.value.rules[1].leadingTrivia).toEqual([]);
  });
});

describe("StyleParser ValueNode AST (Phase 3 / step 1)", () => {
  // Type-narrowing helper that throws on mismatch. Avoids the
  // `expect()` inside `if` pattern that oxlint forbids
  // (no-conditional-expect).
  function expectKind<K extends ValueNode["kind"]>(
    node: ValueNode,
    kind: K,
  ): Extract<ValueNode, { kind: K }> {
    if (node.kind !== kind) {
      throw new Error(`Expected ValueNode kind "${kind}", got "${node.kind}"`);
    }
    return node as Extract<ValueNode, { kind: K }>;
  }

  it("classifies a hex color value", () => {
    const result = StyleParser.parse(`service { color: #1A2B3C; }`);
    const node = expectKind(result.value.rules[0].valueNodes!.color, "hex");
    expect(node.value).toBe("#1A2B3C");
  });

  it("classifies a bare identifier value", () => {
    const result = StyleParser.parse(`edge { direction: down; }`);
    const node = expectKind(result.value.rules[0].valueNodes!.direction, "ident");
    expect(node.value).toBe("down");
  });

  it("classifies a unitless number value", () => {
    const result = StyleParser.parse(`service { opacity: 0.6; }`);
    const node = expectKind(result.value.rules[0].valueNodes!.opacity, "number");
    expect(node.value).toBe(0.6);
    expect(node.raw).toBe("0.6");
  });

  it("classifies a length value with a unit", () => {
    const result = StyleParser.parse(`service { font-size: 12px; }`);
    const node = expectKind(result.value.rules[0].valueNodes!["font-size"], "length");
    expect(node.value).toBe(12);
    expect(node.unit).toBe("px");
    expect(node.raw).toBe("12");
  });

  it("classifies a quoted string value", () => {
    const result = StyleParser.parse(`@deprecated { badge-icon: "warn"; }`);
    const node = expectKind(result.value.rules[0].valueNodes!["badge-icon"], "string");
    expect(node.value).toBe("warn");
  });

  it("classifies a function value like url(...)", () => {
    const result = StyleParser.parse(`service { shape: url("shapes/cloud.svg"); }`);
    const node = expectKind(result.value.rules[0].valueNodes!.shape, "function");
    expect(node.name).toBe("url");
    expect(node.argRaw).toBe("shapes/cloud.svg");
  });

  it("classifies a comma-separated list (font-family)", () => {
    const result = StyleParser.parse(`service { font-family: "Noto Sans JP", sans-serif; }`);
    const node = expectKind(result.value.rules[0].valueNodes!["font-family"], "list");
    expect(node.items.map((i) => i.kind)).toEqual(["string", "ident"]);
  });

  it("attaches a SourceRange to each ValueNode", () => {
    const result = StyleParser.parse(`service { color: #1A2B3C; }`);
    const node = result.value.rules[0].valueNodes!.color;
    expect(node.loc.start.offset).toBeGreaterThan(0);
    expect(node.loc.end.offset).toBeGreaterThan(node.loc.start.offset);
  });

  it("keeps the canonical string properties intact alongside the ValueNode", () => {
    // Existing consumers (resolver / Tidy / svg-builder) read
    // `properties` — adding `valueNodes` must not change that side.
    const result = StyleParser.parse(
      `service { color: #1A2B3C; font-family: "Noto", sans-serif; opacity: 0.6; }`,
    );
    const rule = result.value.rules[0];
    expect(rule.properties.color).toBe("#1A2B3C");
    expect(rule.properties["font-family"]).toBe('"Noto" , sans-serif');
    expect(rule.properties.opacity).toBe("0.6");
  });
});
