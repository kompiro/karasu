import { describe, it, expect } from "vitest";
import { getReference } from "./reference.js";

describe("getReference", () => {
  const ref = getReference();

  it("includes all logical node kinds", () => {
    const kinds = ref.nodeKinds.map((k) => k.kind);
    expect(kinds).toEqual(["system", "service", "domain", "usecase", "resource", "user"]);
  });

  it("all node kinds include label and description as properties", () => {
    for (const kind of ref.nodeKinds) {
      expect(kind.properties).toContain("label");
      expect(kind.properties).toContain("description");
    }
  });

  it("includes all tags", () => {
    const tags = ref.tags.map((t) => t.name);
    expect(tags).toContain("external");
    expect(tags).toContain("async");
    expect(tags).toContain("sync");
    expect(tags).toContain("human");
    expect(tags).toContain("ai");
    expect(tags).toContain("table");
    expect(tags).toContain("queue");
    expect(tags).toContain("api");
    expect(tags).toContain("storage");
  });

  it("includes all annotations", () => {
    const annotations = ref.annotations.map((a) => a.name);
    expect(annotations).toContain("deprecated");
    expect(annotations).toContain("new");
    expect(annotations).toContain("experimental");
    expect(annotations).toContain("migration-target");
  });

  it("includes style properties for nodes and edges", () => {
    const nodeProps = ref.styleProperties.filter(
      (p) => p.appliesTo === "node" || p.appliesTo === "both",
    );
    const edgeProps = ref.styleProperties.filter(
      (p) => p.appliesTo === "edge" || p.appliesTo === "both",
    );
    expect(nodeProps.length).toBeGreaterThan(0);
    expect(edgeProps.length).toBeGreaterThan(0);
  });

  it("includes all shapes", () => {
    const shapes = ref.shapes.map((s) => s.name);
    expect(shapes).toEqual(["box", "user", "cylinder", "queue", "hexagon", "cloud"]);
  });

  it("includes builtin style source", () => {
    expect(ref.builtinStyleSource.length).toBeGreaterThan(0);
    expect(ref.builtinStyleSource).toContain("user");
    expect(ref.builtinStyleSource).toContain("edge");
  });
});
