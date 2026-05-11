/**
 * Cross-surface pictogram source consistency test (Issue #1246).
 *
 * NodeDetailPanel and the icon-card renderer both resolve a node `kind`
 * to an icon name and then look up the SVG pictogram. The two surfaces
 * use independent maps:
 *
 *   - `KIND_TO_ICON_NAME` in `NodeDetailPanel.tsx` (the detail-panel side)
 *   - `ICON_THEME_STYLE_SOURCE` in `@karasu-tools/core` (the icon-card side)
 *
 * Issue #132 §3 shipped because nothing verified these two maps agreed.
 * Each surface had its own unit tests; the cross-surface contract was
 * implicit. TPL-20260510-05 checklist item 4 and TPL-20260510-06
 * checklist item 4 codified the principle ("same kind/data → same source
 * across every surface"). This test operationalizes it.
 *
 * Mechanism: parse `ICON_THEME_STYLE_SOURCE` to recover the source-of-
 * truth `kind → iconName` map, then assert every entry in
 * `KIND_TO_ICON_NAME` matches — except for entries listed in
 * `ALLOWED_DIVERGENCES`, which captures known pre-existing divergences
 * with rationale. The convention: adding to `ALLOWED_DIVERGENCES`
 * requires a rationale in code review; any new accidental divergence
 * fails this test immediately.
 *
 * The icon-card resolver and the detail-panel resolver each have their
 * own targeted unit tests; this test specifically guards the
 * cross-surface invariant.
 *
 * Refs:
 *   - TPL-20260510-05 (implicit data filtering), checklist item 4
 *   - TPL-20260510-06 (display mode cross-surface), checklist item 4
 *   - #132 §3 (the original cross-surface mismatch this would have caught)
 */
import { describe, it, expect } from "vitest";
import { ICON_THEME_STYLE_SOURCE } from "@karasu-tools/core";
import { KIND_TO_ICON_NAME } from "./components/NodeDetailPanel.js";

/**
 * Pre-existing mismatches between the detail-panel map and the
 * icon-theme map that are intentionally allowed.
 *
 * **Adding an entry here requires a written rationale.** New accidental
 * divergences must fail this test, not silently extend this list.
 */
const ALLOWED_DIVERGENCES: Record<string, { iconName: string; rationale: string }> = {
  // Pre-existing as of Issue #1246. icon-theme maps usecase → "usecase"
  // (and `packages/core/icons/usecase.svg` exists), but the detail
  // panel uses the "domain" pictogram. Reason for keeping it is not
  // documented in code or commits; the divergence is recorded here so
  // it surfaces in code review and can be audited separately. See the
  // closing notes of Issue #1246.
  usecase: {
    iconName: "domain",
    rationale:
      "Pre-existing divergence — detail panel reuses the domain pictogram for usecase nodes. Separate audit warranted.",
  },
};

/**
 * Parse `ICON_THEME_STYLE_SOURCE` to recover the kind → iconName
 * mapping. Only matches top-level `<kind> { shape: url("<icon>"); }`
 * rules; tag-qualified rules like `client[mobile] { ... }` are
 * intentionally excluded — those are subtype variants not relevant to
 * NodeDetailPanel's plain-kind lookup.
 */
function parseIconThemeMap(source: string): Record<string, string> {
  const map: Record<string, string> = {};
  // Match `kind { shape: url("X"); }` where `kind` is a bare identifier
  // (no `[tag]` qualifier). The `\b` after the kind name and the
  // lookahead for `{` keep us off the tag-qualified rules.
  const RULE_RE = /^(\w+)\s*\{\s*shape:\s*url\("([^"]+)"\);?\s*\}/gm;
  for (const match of source.matchAll(RULE_RE)) {
    const [, kind, iconName] = match;
    map[kind] = iconName;
  }
  return map;
}

describe("cross-surface pictogram source consistency", () => {
  const iconThemeMap = parseIconThemeMap(ICON_THEME_STYLE_SOURCE);

  it("parses non-empty icon-theme mappings (sanity check)", () => {
    // If the parser regex stops matching due to a syntax change in
    // ICON_THEME_STYLE_SOURCE, the whole rest of this suite passes
    // vacuously. Anchor on a well-known entry so that doesn't happen.
    expect(iconThemeMap.service).toBe("service");
    expect(Object.keys(iconThemeMap).length).toBeGreaterThan(5);
  });

  it("every NodeDetailPanel kind has a matching icon-theme mapping", () => {
    const missingFromIconTheme: string[] = [];
    for (const kind of Object.keys(KIND_TO_ICON_NAME)) {
      if (!(kind in iconThemeMap)) {
        missingFromIconTheme.push(kind);
      }
    }
    expect(missingFromIconTheme).toEqual([]);
  });

  it("every NodeDetailPanel kind resolves to the same icon name as the icon card", () => {
    const mismatches: { kind: string; panel: string; iconTheme: string }[] = [];
    for (const [kind, panelIcon] of Object.entries(KIND_TO_ICON_NAME)) {
      const iconThemeIcon = iconThemeMap[kind];
      if (panelIcon === iconThemeIcon) continue;
      if (ALLOWED_DIVERGENCES[kind]?.iconName === panelIcon) continue;
      mismatches.push({ kind, panel: panelIcon, iconTheme: iconThemeIcon });
    }
    expect(mismatches).toEqual([]);
  });

  it("ALLOWED_DIVERGENCES entries are still divergent (so we notice when one is fixed)", () => {
    // If a future PR fixes one of the divergences (e.g. by renaming
    // `usecase: "domain"` to `usecase: "usecase"`), the entry in
    // ALLOWED_DIVERGENCES is dead and should be removed. This test
    // fails on stale entries so the cleanup is forced.
    const stale: string[] = [];
    for (const [kind, allowed] of Object.entries(ALLOWED_DIVERGENCES)) {
      const panelIcon = KIND_TO_ICON_NAME[kind];
      const iconThemeIcon = iconThemeMap[kind];
      if (panelIcon === undefined) continue; // kind removed from panel map; harmless
      if (panelIcon === iconThemeIcon) {
        stale.push(`${kind} (no longer diverges)`);
      } else if (panelIcon !== allowed.iconName) {
        // Divergence still exists but the panel mapping changed
        // shape — the recorded rationale no longer matches reality.
        stale.push(`${kind} (panel now maps to "${panelIcon}", not "${allowed.iconName}")`);
      }
    }
    expect(stale).toEqual([]);
  });
});
