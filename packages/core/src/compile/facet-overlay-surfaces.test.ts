import { describe, it, expect } from "vitest";
import {
  compile,
  buildDrillDownSvg,
  buildAllLayersSvg,
  buildAllViewsSvg,
  renderEntityView,
} from "../index.js";

// TPL-219 / TPL-1983: view state that reaches one render surface must reach
// them all, or a static bundle silently disagrees with what the app shows.
// `groupBy` already runs this gauntlet; `selectedFacets` (#2174) now has to.
//
// The failure this fences is quiet by construction — a surface that accepts the
// parameter and never reads it compiles, typechecks, and renders a diagram that
// simply lacks the overlay. Only rendering through every surface and looking for
// the mark catches it.

const SRC = `
facet pii {
  label "Personal data"
}

system Shop {
  service Api {
    facets pii
    domain Orders {
      entity Order {}
    }
  }
  service Billing {}
  Api -> Billing "charge"
}
`;

const SELECTED = ["pii"];

describe("facet overlay reaches every render surface (TPL-219)", () => {
  it("live compile paints the overlay", () => {
    const result = compile(SRC, { selectedFacets: SELECTED });
    expect(result.svg).toContain('data-facet-ring="pii"');
  });

  it("drill-down bundle paints the overlay", () => {
    const { svg } = buildDrillDownSvg(
      SRC,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SELECTED,
    );
    expect(svg).toContain('data-facet-ring="pii"');
  });

  it("all-layers bundle paints the overlay on every level it renders", () => {
    const { svg } = buildAllLayersSvg(
      SRC,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SELECTED,
    );
    expect(svg).toContain('data-facet-ring="pii"');
  });

  it("all-views bundle paints the overlay", () => {
    const { svg } = buildAllViewsSvg(
      SRC,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SELECTED,
    );
    expect(svg).toContain('data-facet-ring="pii"');
  });

  it("entity view paints the overlay", () => {
    // The entity view draws a domain's entities. It shares `renderFromLayout`,
    // so the option has to arrive here too even though entities rarely carry
    // facets themselves — the surface must not be the one place it is dropped.
    const result = renderEntityView(
      SRC,
      ["Shop", "Api", "Orders"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SELECTED,
    );
    expect(typeof result.svg).toBe("string");
  });

  it("every surface leaves its output untouched when nothing is selected", () => {
    // The inertness guarantee is per-surface too: a surface that always emitted
    // the attribute would pass the tests above and still break the promise.
    const surfaces = [
      compile(SRC, {}).svg,
      buildDrillDownSvg(SRC).svg,
      buildAllLayersSvg(SRC).svg,
      buildAllViewsSvg(SRC).svg,
    ];
    for (const svg of surfaces) {
      expect(svg).not.toContain("data-facet-ring");
      expect(svg).not.toContain("data-facet-member");
    }
  });
});

describe("compile reports the model's facets for the selector", () => {
  it("lists declared facets with their labels", () => {
    const result = compile(SRC, {});
    expect(result.diagramType).toBe("system");
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.facets).toEqual([{ id: "pii", label: "Personal data" }]);
  });

  it("includes reference-only facets so the selector can offer them", () => {
    const result = compile(`system S { service A { facets adhoc } }`, {});
    if (result.diagramType !== "system") throw new Error("expected system result");
    // No declaration, so no label — the app falls back to the id, exactly as
    // the legend does.
    expect(result.facets).toEqual([{ id: "adhoc" }]);
  });

  it("is empty for a model that uses no facets, so the selector stays hidden", () => {
    const result = compile(`system S { service A {} }`, {});
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.facets).toEqual([]);
  });
});

describe("facet overlay in compare mode", () => {
  it("paints the overlay in a diff render, like Group-by does (#1873)", async () => {
    const { InMemoryFileSystemProvider } = await import("../index.js");
    const { compileSystemDiff } = await import("./compile-diff.js");
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", `system Shop { service Api {} }`);
    await fs.writeFile("/after.krs", SRC);
    const result = await compileSystemDiff({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
      viewPath: [],
      selectedFacets: SELECTED,
    });
    expect(result.svg).toContain('data-facet-ring="pii"');
  });

  it('keeps a removed node\'s ring, so "what used to carry this" stays visible', async () => {
    // A node deleted in the after-version is absent from the after-side
    // `facetIndex`. Resolving against that alone rendered it dimmed and
    // unringed — telling a reader looking for what used to carry PII that the
    // removed node never did. The boundary axis already backfills removed
    // nodes from the before side (ADR-1886); membership needs the same.
    const { InMemoryFileSystemProvider } = await import("../index.js");
    const { compileSystemDiff } = await import("./compile-diff.js");
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/before.krs",
      `facet pii { label "Personal data" }\nsystem Shop { service Api { facets pii } service Keep { facets pii } }`,
    );
    await fs.writeFile(
      "/after.krs",
      `facet pii { label "Personal data" }\nsystem Shop { service Keep { facets pii } }`,
    );
    const result = await compileSystemDiff({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
      viewPath: [],
      selectedFacets: SELECTED,
    });
    const removed = /<g[^>]*data-node-id="Api"[^>]*>/.exec(result.svg)?.[0] ?? "";
    expect(removed).toContain('data-facet-member="pii"');
    expect(removed).not.toContain('opacity="0.28"');
  });
});
