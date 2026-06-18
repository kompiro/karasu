import { describe, it, expect } from "vitest";
import { getReference } from "./reference.js";

describe("getReference", () => {
  const ref = getReference();

  it("includes all node kinds (logical + infra blocks + infra leaves)", () => {
    const kinds = ref.nodeKinds.map((k) => k.kind);
    expect(kinds).toEqual([
      "system",
      "user",
      "client",
      "service",
      "domain",
      "usecase",
      "resource",
      "database",
      "queue",
      "storage",
      "table",
      "queue-item",
      "bucket",
    ]);
  });

  it("client kind exposes handles, resource and link properties", () => {
    const client = ref.nodeKinds.find((k) => k.kind === "client");
    expect(client).toBeDefined();
    expect(client!.properties).toContain("handles");
    expect(client!.properties).toContain("resource");
  });

  it("service kind exposes delivers and handles properties", () => {
    const service = ref.nodeKinds.find((k) => k.kind === "service");
    expect(service!.properties).toContain("delivers");
    expect(service!.properties).toContain("handles");
  });

  it("includes the seven client form-factor tags", () => {
    const tags = ref.tags.map((t) => t.name);
    for (const ff of ["mobile", "web", "desktop", "cli", "device", "extension", "embed"]) {
      expect(tags).toContain(ff);
    }
    const mobile = ref.tags.find((t) => t.name === "mobile")!;
    expect(mobile.appliesTo).toEqual(["client"]);
  });

  it("external tag applies to client as well as service / resource", () => {
    const external = ref.tags.find((t) => t.name === "external")!;
    expect(external.appliesTo).toContain("client");
    expect(external.appliesTo).toContain("service");
    expect(external.appliesTo).toContain("resource");
  });

  it("sample KRS demonstrates the user → client → service access path", () => {
    expect(ref.sampleKrs).toContain("client MobileApp");
    expect(ref.sampleKrs).toContain("Customer -> MobileApp");
    expect(ref.sampleKrs).toContain("MobileApp -> ECommerce");
  });

  it("all node kinds include label and description as properties", () => {
    for (const kind of ref.nodeKinds) {
      expect(kind.properties).toContain("label");
      expect(kind.properties).toContain("description");
    }
  });

  it("every reference entry has a non-empty description in both locales", () => {
    for (const locale of ["en", "ja"] as const) {
      const r = getReference(locale);
      const entries: { what: string; description: string }[] = [
        ...r.nodeKinds.map((k) => ({ what: `nodeKind ${k.kind}`, description: k.description })),
        ...r.deployUnitKinds.map((k) => ({
          what: `deployUnitKind ${k.kind}`,
          description: k.description,
        })),
        ...r.orgKinds.map((k) => ({ what: `orgKind ${k.kind}`, description: k.description })),
        ...r.tags.map((t) => ({ what: `tag ${t.name}`, description: t.description })),
        ...r.annotations.map((a) => ({
          what: `annotation ${a.name}`,
          description: a.description,
        })),
        ...r.styleProperties.map((p) => ({
          what: `styleProperty ${p.name}`,
          description: p.description,
        })),
        ...r.shapes.map((s) => ({ what: `shape ${s.name}`, description: s.description })),
      ];
      const blank = entries.filter((e) => !e.description || e.description.trim() === "");
      expect({ locale, blank: blank.map((e) => e.what) }).toEqual({ locale, blank: [] });
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
    expect(kinds).toEqual([
      "war",
      "jar",
      "oci",
      "lambda",
      "function",
      "assets",
      "job",
      "artifact",
      "store",
    ]);
  });

  it("every deploy unit kind can realize a logical node", () => {
    for (const kind of ref.deployUnitKinds) {
      expect(kind.properties).toContain("realizes");
    }
  });

  it("all deploy unit kinds carry a runtime form except `store`", () => {
    // `store` is a managed data store realizing an infra node; it has no
    // runtime form (its concrete tech is the free-text `type`), so it is the
    // sole exception to the runtime invariant. See ADR-20260616-09.
    const runtimeKinds = ref.deployUnitKinds.filter((k) => k.kind !== "store");
    for (const kind of runtimeKinds) {
      expect(kind.properties).toContain("runtime");
    }
    const store = ref.deployUnitKinds.find((k) => k.kind === "store");
    expect(store?.properties).toContain("type");
    expect(store?.properties).not.toContain("runtime");
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

  it("includes a legend block with ref entries", () => {
    expect(ref.sampleKrs).toMatch(/^legend\b/m);
    expect(ref.sampleKrs).toContain("ref [external]");
  });

  it("sampleKrs parses without errors for both locales", async () => {
    const { Parser } = await import("../parser/parser.js");
    for (const locale of ["en", "ja"] as const) {
      const sample = getReference(locale).sampleKrs;
      const result = Parser.parse(sample);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
    }
  });

  it("exposes per-view syntax sections with a kind-table marker (#1586)", () => {
    for (const view of ["system", "deploy", "org"] as const) {
      const sections = ref.syntaxByView[view];
      expect(sections.length).toBeGreaterThan(0);
      // each view leads with a Block Declaration snippet and includes a kind table
      expect(sections[0]).toMatchObject({ heading: "Block Declaration" });
      expect(sections.some((s) => "kindTable" in s && s.kindTable)).toBe(true);
    }
    // the resource-operations / edge-id syntax the app suite asserts lives here now
    const systemCode = ref.syntaxByView.system.map((s) => ("code" in s ? s.code : "")).join("\n");
    expect(systemCode).toContain("operations create, read");
    expect(systemCode).toContain("#criticalWrite");
  });

  it("exposes per-view style selector examples (#1586)", () => {
    expect(ref.styleSelectorExamplesByView.system).toContain("system diagram selectors");
    expect(ref.styleSelectorExamplesByView.deploy).toContain("deploy diagram selectors");
    expect(ref.styleSelectorExamplesByView.org).toContain("org diagram selectors");
  });

  it("exposes the selector-specificity table (#1586)", () => {
    const byExample = new Map(ref.selectorSpecificity.map((r) => [r.example, r.specificity]));
    expect(byExample.get("service")).toBe(1);
    expect(byExample.get("#ECommerce")).toBe(100);
    expect(byExample.get("edge#criticalWrite")).toBe(101);
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

  // #1642: the Samples tab's deploy / org starters are locale-appropriate, like
  // the system starter — en gets the English variants, ja the Japanese ones.
  it("serves locale-appropriate deploy / org samples", () => {
    const en = getReference("en");
    expect(en.samplesByView.deploy).toContain('label "Production environment"');
    expect(en.samplesByView.org).toContain('label "Platform team"');

    const ja = getReference("ja");
    expect(ja.samplesByView.deploy).toContain('label "本番環境"');
    expect(ja.samplesByView.org).toContain('label "プラットフォームチーム"');
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
