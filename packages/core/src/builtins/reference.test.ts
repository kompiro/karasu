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
    expect(annotations).toContain("migration_target");
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

  it("includes all deploy unit kinds", () => {
    const kinds = ref.deployUnitKinds.map((k) => k.kind);
    expect(kinds).toEqual(["war", "jar", "oci", "lambda", "function", "assets", "job", "artifact"]);
  });

  it("all deploy unit kinds include runtime and realizes as properties", () => {
    for (const kind of ref.deployUnitKinds) {
      expect(kind.properties).toContain("runtime");
      expect(kind.properties).toContain("realizes");
    }
  });

  it("includes all org kinds", () => {
    const kinds = ref.orgKinds.map((k) => k.kind);
    expect(kinds).toEqual(["organization", "team", "member"]);
  });

  it("team kind can contain team and member", () => {
    const team = ref.orgKinds.find((k) => k.kind === "team")!;
    expect(team.canContain).toContain("team");
    expect(team.canContain).toContain("member");
  });

  it("includes sampleKrs with system, deploy, and organization blocks", () => {
    expect(ref.sampleKrs).toContain("system");
    expect(ref.sampleKrs).toContain("deploy");
    expect(ref.sampleKrs).toContain("organization");
  });

  it("returns the same cached instance on second call (cache hit branch)", () => {
    const ref1 = getReference();
    const ref2 = getReference();
    expect(ref1).toBe(ref2);
  });
});

describe("getReference — locale", () => {
  it("defaults to English", () => {
    const en = getReference();
    expect(en.nodeKinds.find((k) => k.kind === "system")?.description).toMatch(
      /Container|service/i,
    );
    expect(en.sampleKrs).toContain('label "EC Platform"');
  });

  it("returns Japanese strings when locale is 'ja'", () => {
    const ja = getReference("ja");
    expect(ja.nodeKinds.find((k) => k.kind === "system")?.description).toContain("サービス");
    expect(ja.sampleKrs).toContain('label "ECプラットフォーム"');
  });

  it("caches per locale independently", () => {
    const en1 = getReference("en");
    const ja1 = getReference("ja");
    const en2 = getReference("en");
    const ja2 = getReference("ja");
    expect(en1).toBe(en2);
    expect(ja1).toBe(ja2);
    expect(en1).not.toBe(ja1);
  });

  it("preserves non-translatable identifiers in both locales", () => {
    const en = getReference("en");
    const ja = getReference("ja");
    expect(en.nodeKinds.map((k) => k.kind)).toEqual(ja.nodeKinds.map((k) => k.kind));
    expect(en.tags.map((t) => t.name)).toEqual(ja.tags.map((t) => t.name));
    expect(en.shapes.map((s) => s.name)).toEqual(ja.shapes.map((s) => s.name));
    expect(en.annotations.map((a) => a.defaultBadge.color)).toEqual(
      ja.annotations.map((a) => a.defaultBadge.color),
    );
  });
});
