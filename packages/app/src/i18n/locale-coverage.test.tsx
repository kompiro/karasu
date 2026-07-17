import { describe, expect, it } from "vitest";
import {
  compile,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
} from "@karasu-tools/core";
import { ja, translate } from "@karasu-tools/i18n";

// Sanity check: the ja translation map covers the empty-state keys the
// app passes into core renderers via useEmptyStateLabels. If this fails,
// the EmptyStateLabels pipeline is missing a key in ja.ts and the user
// will see English text in the rendered SVG.
describe("i18n locale coverage — empty-state pipeline", () => {
  it("ja provides all empty-state keys covered by EmptyStateLabels", () => {
    expect(ja["emptyState.deploy.title"]).toBeDefined();
    expect(ja["emptyState.deploy.hint"]).toBeDefined();
    expect(ja["emptyState.org.noTeams"]).toBeDefined();
    expect(ja["emptyState.system.noNodes"]).toBeDefined();
    expect(ja["emptyState.org.placeholder"]).toBeDefined();
    expect(ja["emptyState.system.noDiagram"]).toBeDefined();
  });

  it("ja provides all badge keys covered by AnnotationBadgeLabels", () => {
    expect(ja["badge.deprecated"]).toBeDefined();
    expect(ja["badge.new"]).toBeDefined();
    expect(ja["badge.experimental"]).toBeDefined();
    expect(ja["badge.migrationTarget"]).toBeDefined();
  });
});

// Built-in annotation badge labels follow the locale via
// annotationBadgeLabels (#1508). en defaults come from reference-data.
describe("i18n locale coverage — annotation badge pipeline", () => {
  const krs = `system S {\n  service Legacy @deprecated {}\n}\n`;

  it("ja compile renders the ja @deprecated badge, not the en default", () => {
    const result = compile(krs, {
      diagramType: "system",
      annotationBadgeLabels: { deprecated: translate("ja", "badge.deprecated") },
    });
    expect(result.svg).toContain(translate("ja", "badge.deprecated"));
    expect(result.svg).not.toContain("Deprecated");
  });

  it("user .krs.style badge-label still wins over the injected label", () => {
    const result = compile(krs, {
      diagramType: "system",
      styleSource: `@deprecated { badge-label: "LEGACY"; }`,
      annotationBadgeLabels: { deprecated: translate("ja", "badge.deprecated") },
    });
    expect(result.svg).toContain("LEGACY");
    expect(result.svg).not.toContain(translate("ja", "badge.deprecated"));
  });
});

// Fence for the `badge.*` ↔ core reference-data label contract.
// docs/spec/i18n.md names core's `reference-data.ts` the single source of
// truth for the built-in annotation badge labels, and the i18n en catalog
// hand-duplicates them (with only a comment as protection). `REFERENCE_DATA`
// is not part of core's public API, so instead of a deep import we pin the
// contract transitively: a DEFAULT compile (no `annotationBadgeLabels`
// injection) renders the reference-data en labels — asserting those renders
// match `translate("en", "badge.*")` fails if either side's wording forks.
describe("i18n locale coverage — badge.* matches core reference-data defaults", () => {
  const krs = [
    "system S {",
    "  service Legacy @deprecated {}",
    "  service Fresh @new {}",
    "  service Lab @experimental {}",
    "  service Next @migration_target {}",
    "}",
    "",
  ].join("\n");

  // One compile is enough — all four badges render into the same SVG.
  const svg = compile(krs, { diagramType: "system" }).svg;

  const cases = [
    ["deprecated", "badge.deprecated"],
    ["new", "badge.new"],
    ["experimental", "badge.experimental"],
    ["migration_target", "badge.migrationTarget"],
  ] as const;

  for (const [annotation, key] of cases) {
    it(`default compile renders the en label for @${annotation} (= translate("en", "${key}"))`, () => {
      // Exact match at the SVG text-node boundary — badge labels render as
      // `<text ...>Label</text>` (core's badgeChildren). A substring
      // `toContain(label)` would still pass if the core-side label forked
      // into a superstring (e.g. "Deprecated (legacy)").
      expect(svg).toContain(`>${translate("en", key)}</text>`);
    });
  }
});

// Regression guard for ja-locale renders. As each follow-up i18n-izes a
// known core hardcode, drop it from this list. When the list is empty the
// test as a whole is dead code and can be removed.
const jaLabels = {
  systemNoNodes: translate("ja", "emptyState.system.noNodes"),
  orgPlaceholder: translate("ja", "emptyState.org.placeholder"),
  systemNoDiagram: translate("ja", "emptyState.system.noDiagram"),
};

describe("i18n locale coverage — ja renders contain no English empty-state hardcodes", () => {
  it("system view: renders ja, not 'No nodes to render'", () => {
    const result = compile("system Demo {}\n", {
      diagramType: "system",
      emptyStateLabels: jaLabels,
    });
    expect(result.svg).not.toContain("No nodes to render");
    expect(result.svg).toContain(jaLabels.systemNoNodes);
  });

  it("org all-layers: renders ja, not 'No org diagram'", () => {
    // Source with no organization block triggers the placeholder.
    const result = buildAllLayersSvgOrg("system S {}\n", undefined, undefined, jaLabels);
    expect(result.svg).not.toContain("No org diagram");
    expect(result.svg).toContain(jaLabels.orgPlaceholder);
  });

  it("org drill-down: renders ja, not 'No org diagram'", () => {
    const result = buildDrillDownSvgOrg("system S {}\n", undefined, undefined, jaLabels);
    expect(result.svg).not.toContain("No org diagram");
    expect(result.svg).toContain(jaLabels.orgPlaceholder);
  });

  it("system all-layers: renders ja, not 'No diagram'", () => {
    // `system Empty {}` has no child nodes → triggers the placeholder.
    const result = buildAllLayersSvg("system Empty {}\n", undefined, undefined, jaLabels);
    expect(result.svg).not.toContain(">No diagram<");
    expect(result.svg).toContain(jaLabels.systemNoDiagram);
  });

  it("system drill-down: renders ja, not 'No diagram'", () => {
    const result = buildDrillDownSvg("system Empty {}\n", undefined, undefined, jaLabels);
    expect(result.svg).not.toContain(">No diagram<");
    expect(result.svg).toContain(jaLabels.systemNoDiagram);
  });
});
