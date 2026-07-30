import { describe, it, expect } from "vitest";
import { ICON_THEME_STYLE_SOURCE } from "@karasu-tools/core";
import { KIND_TO_ICON_NAME } from "./NodeDetailPanel.js";

// Cross-surface icon source consistency (TPL-999 / -06 item 4).
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
// url("<name>") }` rules from the style source and reconciles them with
// `KIND_TO_ICON_NAME` over the *union* of both key sets:
//   - a kind in both maps must resolve to the same icon name;
//   - a panel-only kind (claims a pictogram with no renderer rule) is drift
//     and fails;
//   - a renderer-only kind is a deliberate panel-coverage gap and must be
//     enumerated in `KNOWN_PANEL_GAPS` — a *new* renderer-only kind fails
//     until it is either added to the panel map or consciously listed there.
// So adding a new kind to either map without the other gets caught here (the
// union reconciliation at the bottom).

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

describe("icon source consistency between NodeDetailPanel and icon-card renderer (TPL-999 / TPL-1001)", () => {
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

  // Renderer kinds the panel deliberately does not map to a pictogram. The
  // renderer paints these on the diagram, but `NodeDetailPanel` intentionally
  // falls through to its emoji/`■` fallback for them today. Each entry is a
  // conscious coverage gap, not drift — a *new* renderer-only kind is NOT
  // allowed to appear here silently: it fails the union check below until it
  // is either added to `KIND_TO_ICON_NAME` or added to this list on purpose.
  const KNOWN_PANEL_GAPS = ["client", "database", "queue", "storage"] as const;

  it("panel and renderer icon maps reconcile over their union", () => {
    // Reconcile the *union* of both key sets so that adding a kind to either
    // map without the other is caught (the one-directional intersection check
    // this replaced let renderer-only additions pass green — see #1856).
    const panelKinds = Object.keys(KIND_TO_ICON_NAME);
    const rendererKinds = Object.keys(RENDERER_KIND_TO_ICON);
    expect(panelKinds.length).toBeGreaterThanOrEqual(3);

    const gaps = new Set<string>(KNOWN_PANEL_GAPS);
    const allKinds = new Set<string>([...panelKinds, ...rendererKinds]);

    const problems: Array<{ kind: string; reason: string }> = [];
    for (const kind of allKinds) {
      const panel = KIND_TO_ICON_NAME[kind];
      const renderer = RENDERER_KIND_TO_ICON[kind];
      if (panel !== undefined && renderer !== undefined) {
        // In both maps: icon names must be identical.
        if (panel !== renderer) {
          problems.push({
            kind,
            reason: `icon name differs (panel="${panel}", renderer="${renderer}")`,
          });
        }
      } else if (panel !== undefined) {
        // Panel-only: a pictogram claim with no renderer counterpart is drift.
        problems.push({
          kind,
          reason: `panel maps "${kind}" to "${panel}" but the renderer has no rule for it`,
        });
      } else {
        // Renderer-only: allowed only if enumerated as a known panel gap.
        if (!gaps.has(kind)) {
          problems.push({
            kind,
            reason: `renderer paints "${kind}" ("${renderer}") but the panel does not map it and it is not in KNOWN_PANEL_GAPS — add it to KIND_TO_ICON_NAME or to KNOWN_PANEL_GAPS`,
          });
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("KNOWN_PANEL_GAPS has no stale entries", () => {
    // A gap that has since gained a panel mapping must be removed from the
    // allowlist, otherwise the list silently masks a kind that is now
    // covered — and would keep masking a future renderer/panel divergence.
    const stale = KNOWN_PANEL_GAPS.filter((kind) => KIND_TO_ICON_NAME[kind] !== undefined);
    expect(stale).toEqual([]);

    // Every listed gap must actually be a renderer kind — a typo or a kind
    // removed from `ICON_RULES` should not linger here.
    const unknown = KNOWN_PANEL_GAPS.filter((kind) => RENDERER_KIND_TO_ICON[kind] === undefined);
    expect(unknown).toEqual([]);
  });
});
