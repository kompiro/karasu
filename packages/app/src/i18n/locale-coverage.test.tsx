import { describe, expect, it } from "vitest";
import { compile } from "@karasu-tools/core";
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
  });
});

// Regression guard for ja-locale renders. As each follow-up i18n-izes a
// known core hardcode, drop it from this list. When the list is empty the
// test as a whole is dead code and can be removed. Currently active for
// the system-view path (#827); the org placeholder path is tracked in
// #828 and not yet covered here.
const jaSystemLabels = {
  systemNoNodes: translate("ja", "emptyState.system.noNodes"),
};

describe("i18n locale coverage — ja system view has no English empty-state hardcode", () => {
  it("renders the ja translation, not 'No nodes to render'", () => {
    // An empty system block produces the empty-state placeholder.
    const result = compile("system Demo {}\n", {
      diagramType: "system",
      emptyStateLabels: jaSystemLabels,
    });
    expect(result.svg).not.toContain("No nodes to render");
    expect(result.svg).toContain(jaSystemLabels.systemNoNodes);
  });
});
