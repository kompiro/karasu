import { describe, expect, it } from "vitest";
import {
  compile,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
} from "@karasu-tools/core";
import { ja } from "./ja.js";
import { translate } from "./index.js";

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
