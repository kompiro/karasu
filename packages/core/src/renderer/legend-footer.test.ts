import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

/**
 * End-to-end coverage for the legend footer (Issue #887).
 *
 * Each test compiles a `.krs` source through `compile()` and inspects the
 * resulting SVG string. The `legend-footer` group is appended to the SVG
 * by the relevant renderer (svg-renderer for system / deploy via
 * delegation, org-renderer's main team-grid path for org).
 */

const SYSTEM_KRS = `
system Demo {
  service Api {
    label "API"
  }
}
`;

const ORG_KRS = `
organization Acme {
  team Backend {
    label "Backend"
  }
}
`;

describe("legend footer rendering", () => {
  it("does not emit a footer when no legend block is declared", () => {
    const result = compile(SYSTEM_KRS, { diagramType: "system" });
    expect(result.svg).not.toContain("legend-footer");
  });

  it("emits a footer in the system view for an unscoped legend with a swatch entry", () => {
    const krs = `${SYSTEM_KRS}
legend "Owner" {
  swatch #2563EB "Team Backend"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("Team Backend");
    // The swatch <rect> uses the literal hex from the source.
    expect(result.svg).toContain('fill="#2563EB"');
  });

  it("renders the legend title above the entries", () => {
    const krs = `${SYSTEM_KRS}
legend "Owner team" {
  swatch #2563EB "a"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("Owner team");
  });

  it("scopes a deploy-only legend to the deploy view", () => {
    const krs = `
system Demo {
  service Api { label "API" }
}
deploy Production {
  oci "api" { realizes Api }
}
legend deploy "Hosting" {
  swatch #0EA5E9 "Cloud Run"
}
`;
    const systemSvg = compile(krs, { diagramType: "system" }).svg;
    const deploySvg = compile(krs, { diagramType: "deploy" }).svg;
    expect(systemSvg).not.toContain("Cloud Run");
    expect(deploySvg).toContain("Cloud Run");
    expect(deploySvg).toContain('fill="#0EA5E9"');
  });

  it("shows an unscoped legend on every view", () => {
    const krs = `
system Demo {
  service Api { label "API" }
}
deploy Production {
  oci "api" { realizes Api }
}
organization Acme {
  team Backend { label "Backend" }
}
legend "Owner" {
  swatch #2563EB "Team Backend"
}
`;
    expect(compile(krs, { diagramType: "system" }).svg).toContain("Team Backend");
    expect(compile(krs, { diagramType: "deploy" }).svg).toContain("Team Backend");
    expect(compile(krs, { diagramType: "org" }).svg).toContain("Team Backend");
  });

  it("resolves a ref @annotation through the builtin style sheet", () => {
    // The builtin sheet defines @deprecated with a badge color. The
    // legend footer should pick up that color.
    const krs = `${SYSTEM_KRS}
legend "Status" {
  ref @deprecated "Deprecated"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("Deprecated");
    // The builtin defines @deprecated badge-color #EF4444.
    expect(result.svg).toContain('fill="#EF4444"');
  });

  it("resolves a ref [tag] through the builtin style sheet", () => {
    const krs = `${SYSTEM_KRS}
legend "Origin" {
  ref [external] "Third-party"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("Third-party");
  });

  it("skips an unresolved ref instead of emitting a colorless swatch", () => {
    const krs = `${SYSTEM_KRS}
legend {
  swatch #2563EB "Resolved swatch"
  ref @gone "Unresolved annotation"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("Resolved swatch");
    // Unresolved ref entries are dropped from the footer rendering.
    expect(result.svg).not.toContain("Unresolved annotation");
  });

  it("does not emit a footer when every entry is unresolved", () => {
    const krs = `${SYSTEM_KRS}
legend {
  ref @gone "Missing annotation"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).not.toContain("legend-footer");
  });

  it("stacks multiple legend blocks in declaration order on the same view", () => {
    const krs = `${SYSTEM_KRS}
legend "First" {
  swatch #2563EB "Alpha"
}
legend "Second" {
  swatch #16A34A "Beta"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg.indexOf("First")).toBeLessThan(result.svg.indexOf("Second"));
    expect(result.svg.indexOf("Alpha")).toBeLessThan(result.svg.indexOf("Beta"));
  });

  it("extends the SVG height when a footer is appended", () => {
    const without = compile(SYSTEM_KRS, { diagramType: "system" });
    const withLegend = compile(
      `${SYSTEM_KRS}
legend "Owner" {
  swatch #2563EB "Alpha"
}
`,
      { diagramType: "system" },
    );

    const heightAttr = (svg: string): number => {
      const match = svg.match(/<svg[^>]*height="(\d+(?:\.\d+)?)"/);
      return match ? Number(match[1]) : Number.NaN;
    };
    expect(heightAttr(withLegend.svg)).toBeGreaterThan(heightAttr(without.svg));
  });

  it("emits a fallback swatch for a ref whose tag is in use but unstyled (Issue #999)", () => {
    // `[human]` is documented in spec/tags-annotations.md as having no
    // default style impact, but it appears on real user nodes — so the
    // legend ref is semantically valid and must be shown. The renderer
    // falls back to a neutral swatch (#9CA3AF).
    const krs = `
system Demo {
  user Customer [human] {}
  service Api {}
  Customer -> Api
}
legend "凡例" {
  ref [human] "人間ユーザー"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("人間ユーザー");
    expect(result.svg).toContain('fill="#9CA3AF"');
    // No legend-ref-unresolved warning: the resolver agreed the ref
    // resolves (annotation in use), and the renderer now agrees too.
    const unresolved = result.warnings.filter((w) => w.kind === "legend-ref-unresolved");
    expect(unresolved).toHaveLength(0);
  });

  it("still drops a ref whose target is unused (regression check)", () => {
    // `@gone` has no nodes carrying it and no style rule paints it. The
    // legend footer must keep dropping these so the prior unresolved-ref
    // behavior is preserved.
    const krs = `${SYSTEM_KRS}
legend {
  swatch #2563EB "Resolved swatch"
  ref @gone "Unresolved annotation"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("Resolved swatch");
    expect(result.svg).not.toContain("Unresolved annotation");
  });

  it("emits a fallback swatch via the org renderer too (Issue #999)", () => {
    // Verify the legendUsage threading is wired into the org renderer
    // path, not just the system renderer. `[mobile]` has no builtin
    // style rule but appears on a client node, so the legend ref must
    // surface with the fallback swatch when the org view is rendered.
    const krs = `
system S {
  client App [mobile] { label "App" }
}
organization Acme {
  team Backend { label "Backend" }
}
legend "凡例" {
  ref [mobile] "モバイル"
}
`;
    const result = compile(krs, { diagramType: "org" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("モバイル");
    expect(result.svg).toContain('fill="#9CA3AF"');
  });

  it("emits a fallback swatch for a selector ref pointing at an in-use node id (Issue #999)", () => {
    // `ref #ApiNode` resolves to a real node id, but no style rule
    // paints `#ApiNode`. The selector branch of legendRefHasUsage must
    // pick this up and trigger the same fallback.
    const krs = `
system Demo {
  service ApiNode { label "API" }
}
legend "凡例" {
  ref #ApiNode "メイン API"
}
`;
    const result = compile(krs, { diagramType: "system" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("メイン API");
    expect(result.svg).toContain('fill="#9CA3AF"');
  });

  it("renders a footer on the org view", () => {
    const krs = `${ORG_KRS}
legend "Owner" {
  swatch #2563EB "Backend"
}
`;
    const result = compile(krs, { diagramType: "org" });
    expect(result.svg).toContain("legend-footer");
    expect(result.svg).toContain("Backend");
  });
});
