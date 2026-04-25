import { describe, expect, it } from "vitest";
import { ja } from "./ja.js";

// Sanity check: the ja translation map covers the empty-state keys the
// app passes into core renderers via useEmptyStateLabels. If this fails,
// the EmptyStateLabels pipeline is missing a key in ja.ts and the user
// will see English text in the rendered SVG.
//
// A broader regression test that compiles each diagram type in ja and
// asserts no known English hardcode leaks (e.g. "No nodes to render",
// "No org diagram") will be added together with the first follow-up
// that i18n-izes one of those strings — see docs/spec/i18n.md.
describe("i18n locale coverage — empty-state pipeline", () => {
  it("ja provides all empty-state keys covered by EmptyStateLabels", () => {
    expect(ja["emptyState.deploy.title"]).toBeDefined();
    expect(ja["emptyState.deploy.hint"]).toBeDefined();
    expect(ja["emptyState.org.noTeams"]).toBeDefined();
  });
});
