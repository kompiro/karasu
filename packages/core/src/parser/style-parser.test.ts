import { describe, it, expect } from "vitest";
import { StyleParser, computeSpecificity } from "./style-parser.js";

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
    expect(computeSpecificity({ nodeType: "service", tags: ["external"], annotations: [] })).toBe(
      11,
    );
  });

  it("tag + annotation = 20", () => {
    expect(computeSpecificity({ tags: ["external"], annotations: ["deprecated"] })).toBe(20);
  });

  it("id = 100", () => {
    expect(computeSpecificity({ id: "ECommerce", tags: [], annotations: [] })).toBe(100);
  });
});
