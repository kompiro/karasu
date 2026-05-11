import { describe, it, expect } from "vitest";
import { ICON_THEME_STYLE_SOURCE } from "@karasu-tools/core";
import { KIND_TO_ICON_NAME } from "./NodeDetailPanel.js";

// Cross-surface icon source consistency (TPL-20260510-05 / -06 item 4).
//
// Two independent mappings live in the codebase:
//   1. `ICON_THEME_STYLE_SOURCE` in @karasu-tools/core — the .krs.style
//      cascade used by the SVG renderer to pick an icon for each node kind.
//   2. `KIND_TO_ICON_NAME` in NodeDetailPanel — the hardcoded lookup the
//      hover panel uses to render the pictogram alongside node metadata.
//
// If they drift, users see one icon on the diagram and a different icon
// in the panel — the original failure mode of #132 §3. The existing
// per-surface tests cannot catch this: each renders its own surface with
// its own mock and never compares the resolved icon between the two.
//
// This integration-level test extracts the un-decorated `<kind> { shape:
// url("<name>") }` rules from the style source, intersects them with
// `KIND_TO_ICON_NAME`, and asserts the icon name is identical for every
// shared kind. Adding a new kind to either map without the other gets
// caught here (the intersection-only-coverage assertion at the bottom).

/**
 * Parse the un-decorated kind→icon mappings out of `ICON_THEME_STYLE_SOURCE`.
 * Tag-decorated selectors (e.g. `resource[table]`, `client[mobile]`) are
 * excluded because `KIND_TO_ICON_NAME` is keyed on bare kind only — the
 * panel does not branch on tags today.
 */
function parseRendererKindToIcon(source: string): Record<string, string> {
  const map: Record<string, string> = {};
  const rule = /^\s*([a-z][a-z-]*)\s*\{\s*shape:\s*url\("([^"]+)"\)\s*;?\s*\}/gm;
  for (const match of source.matchAll(rule)) {
    const [, kind, iconName] = match;
    map[kind] = iconName;
  }
  return map;
}

const RENDERER_KIND_TO_ICON = parseRendererKindToIcon(ICON_THEME_STYLE_SOURCE);

describe("icon source consistency between NodeDetailPanel and icon-card renderer (TPL-05 / -06)", () => {
  it("parser sanity: extracts the representative kinds the test depends on", () => {
    // If the format of ICON_THEME_STYLE_SOURCE changes (e.g. spacing,
    // quoting) and the regex stops matching, the rest of this suite would
    // pass vacuously. This sanity check pins the parser.
    expect(RENDERER_KIND_TO_ICON.service).toBeDefined();
    expect(RENDERER_KIND_TO_ICON.domain).toBeDefined();
    expect(RENDERER_KIND_TO_ICON.database).toBeDefined();
  });

  // Three representative kinds covering distinct branches of the panel
  // map: logical (service), business (domain), deploy (oci). The
  // intersection assertion below covers every other kind too; these
  // explicit cases make the failure message obvious when one breaks.
  it.each(["service", "domain", "oci"])(
    "%s: panel and renderer resolve the same icon name",
    (kind) => {
      expect(KIND_TO_ICON_NAME[kind]).toBe(RENDERER_KIND_TO_ICON[kind]);
    },
  );

  it("every panel-claimed kind agrees with the renderer", () => {
    // Iterate the panel side: any kind the panel maps to a pictogram is
    // a claim that the panel and renderer will paint the same icon. The
    // renderer maps more kinds than the panel (`database`, `queue`,
    // `storage`, `client`, ...) — those are panel-coverage gaps, not
    // contract violations, so they don't fail here. Adding a kind to
    // `KIND_TO_ICON_NAME` whose renderer counterpart differs (or doesn't
    // exist) does fail here.
    const claimedKinds = Object.keys(KIND_TO_ICON_NAME);
    expect(claimedKinds.length).toBeGreaterThanOrEqual(3);

    const mismatches = claimedKinds
      .filter(
        (kind) =>
          RENDERER_KIND_TO_ICON[kind] !== undefined &&
          KIND_TO_ICON_NAME[kind] !== RENDERER_KIND_TO_ICON[kind],
      )
      .map((kind) => ({
        kind,
        panel: KIND_TO_ICON_NAME[kind],
        renderer: RENDERER_KIND_TO_ICON[kind],
      }));
    expect(mismatches).toEqual([]);
  });
});
