import { describe, it, expect } from "vitest";
import { getBuiltinStyleSheet } from "./default-style.js";
import { resolvePalette, type DiagramTheme } from "../renderer/palette.js";
import {
  compositeOver,
  contrastRatio,
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
} from "../renderer/contrast.js";
import { BOUNDARY_TINT_ALPHA } from "../renderer/svg-renderer.js";
import { chipInk } from "../renderer/corner-lane.js";
import type { StyleRule } from "../types/style.js";

/**
 * Badge labels are drawn as small (9px bold) text in their badge-color
 * directly on the diagram canvas (renderer/badge.ts), so every builtin
 * badge-color must meet WCAG AA for normal-size text (>= 4.5:1) against the
 * theme's canvas background. The light theme shipped deploy-kind badge
 * colors as low as 1.92:1 before this guard existed (#2366 proposal A;
 * sibling perspective of TPL-1697 / TPL-2366).
 */

function ruleLabel(rule: StyleRule): string {
  return JSON.stringify(rule.selector);
}

describe.each(["dark", "light"] as DiagramTheme[])("builtin badge colors (%s theme)", (theme) => {
  const sheet = getBuiltinStyleSheet(theme);
  const canvasBg = resolvePalette(theme).canvasBg;
  const badgeRules = sheet.rules.filter((r) => r.properties["badge-color"]);

  it("finds the deploy kind and annotation badge rules", () => {
    // 9 deploy kinds + database[index] + 4 store-role rules (`[cache]` and
    // `[analytics]`, each written as a `database, storage` comma list that
    // expands into one rule per selector) + 6 annotations = 20 as of #2172.
    // Exact so a badge rule dropped from BOTH themes cannot silently
    // shrink this guard's coverage; update the arithmetic when adding one.
    expect(badgeRules.length).toBe(20);
  });

  it("keeps the badge fallback color AA-legible on the canvas", () => {
    // badge.ts falls back to palette.badgeFallback when a user rule sets
    // badge-label without badge-color; that text draws on the same canvas.
    const ratio = contrastRatio(resolvePalette(theme).badgeFallback, canvasBg);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it.each(badgeRules.map((r) => [ruleLabel(r), r.properties["badge-color"]] as const))(
    "badge-color of %s is AA-legible on the canvas",
    (_label, color) => {
      const ratio = contrastRatio(color, canvasBg);
      expect(ratio, `badge-color ${color} must be a hex color`).toBeDefined();
      expect(
        ratio!,
        `badge-color ${color} on canvas ${canvasBg} is below ${WCAG_AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );

  // Boundary frames tint the canvas under member nodes at BOUNDARY_TINT_ALPHA,
  // and badge labels can render inside a frame. Enforcing 4.5:1 over every
  // tint would recolor long-standing dark-theme values, so this PR picks a
  // two-tier guard: 4.5:1 on the bare canvas (above) plus an AA-large 3:1
  // backstop over the worst-case single-frame tint. The #2366 follow-up's
  // stronger alternatives (headroom colors, or full AA asserted over the
  // composite) stay open with the experimental boundary work.
  it.each(badgeRules.map((r) => [ruleLabel(r), r.properties["badge-color"]] as const))(
    "badge-color of %s stays above the AA-large backstop under boundary tints",
    (_label, color) => {
      for (const hue of resolvePalette(theme).boundaryHues) {
        const tinted = compositeOver(hue, canvasBg, BOUNDARY_TINT_ALPHA);
        expect(tinted, `boundary hue ${hue} must be a hex color`).toBeDefined();
        const ratio = contrastRatio(color, tinted!);
        expect(
          ratio!,
          `badge-color ${color} over tint ${tinted} is below ${WCAG_AA_LARGE_TEXT}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
      }
    },
  );

  // Since #2420 the annotation badge is also drawn as a solid pill filled with
  // badge-color, with the label *on top of* it — a second, independent
  // contrast pair the canvas guard above says nothing about. The ink is picked
  // per pill by `chipInk`, so what has to hold is that the better of the two
  // inks clears AA; white alone would fail every dark-theme color here
  // (`#F59E0B` reaches 2.15:1).
  it.each([
    ...badgeRules.map((r) => [ruleLabel(r), r.properties["badge-color"]] as const),
    ["palette badgeFallback", resolvePalette(theme).badgeFallback] as const,
  ])("chip label on the %s pill is AA-legible", (_label, color) => {
    const ink = chipInk(color);
    const ratio = contrastRatio(ink, color);
    expect(ratio, `badge-color ${color} must be a hex color`).toBeDefined();
    expect(
      ratio!,
      `chip ink ${ink} on pill ${color} is below ${WCAG_AA_NORMAL_TEXT}:1`,
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  // Edge labels (11px) draw in the edge rule's `color` directly on the
  // canvas, so those colors need the same AA bar as badge labels.
  const edgeRules = sheet.rules.filter(
    (r) => JSON.stringify(r.selector).includes('"edge"') && r.properties["color"],
  );

  it("finds the edge label color rules", () => {
    // base edge + cyclic / implicit / inferred / delivers / projected = 6 as of #2721.
    expect(edgeRules.length).toBe(6);
  });

  it.each(edgeRules.map((r) => [ruleLabel(r), r.properties["color"]] as const))(
    "edge color of %s is AA-legible on the canvas",
    (_label, color) => {
      const ratio = contrastRatio(color, canvasBg);
      expect(ratio, `edge color ${color} must be a hex color`).toBeDefined();
      expect(
        ratio!,
        `edge color ${color} on canvas ${canvasBg} is below ${WCAG_AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );
});

/**
 * The kind color vocabulary (#2421, docs/spec/style.md § Kind color vocabulary)
 * turned "what color is a kind" into two derivation rules. These assertions are
 * what makes a rule a rule rather than a comment: a new kind whose fill and text
 * are not same-hue partners fails here, not in a reviewer's eye.
 *
 * Scoped to *bare kind* rules on purpose. A tag rule legitimately paints half a
 * pair — builtin `[external]` sets only `background-color` / `border-style` and
 * inherits its text color from whichever kind rule it lands on — so demanding a
 * text color from every painting rule would fail on a correct sheet.
 */
function isBareKindSelector(rule: StyleRule): boolean {
  const s = rule.selector;
  return (
    s.nodeType !== undefined &&
    s.tags.length === 0 &&
    s.annotations.length === 0 &&
    s.facets.length === 0 &&
    s.id === undefined
  );
}

describe.each(["dark", "light"] as DiagramTheme[])("builtin kind colors (%s theme)", (theme) => {
  const palette = resolvePalette(theme);
  const canvasBg = palette.canvasBg;
  const kindRules = getBuiltinStyleSheet(theme)
    .rules.filter(isBareKindSelector)
    .filter((r) => r.properties["background-color"]);

  // Boundary membership is 1:N (#2161), so frames overlap and their tints stack.
  // Checking one tint would leave the second and third frame unmeasured, which is
  // exactly where a fill-less border runs out of contrast first.
  const OVERLAPPING_FRAMES = 3;

  /** The canvas as seen under 0..N stacked boundary frame tints. */
  const canvasSurfaces: string[] = [canvasBg];
  for (const hue of palette.boundaryHues) {
    let surface = canvasBg;
    for (let depth = 0; depth < OVERLAPPING_FRAMES; depth++) {
      surface = compositeOver(hue, surface, BOUNDARY_TINT_ALPHA)!;
      canvasSurfaces.push(surface);
    }
  }

  it("finds the kind rules that paint a card", () => {
    // 7 logical (user / service / client / domain / usecase / entity / resource)
    // + team + member + 3 infra (database / queue / storage) + 9 deploy = 21.
    // Exact so a kind dropping out of one theme cannot silently shrink coverage.
    expect(kindRules.length).toBe(21);
  });

  it.each(kindRules.map((r) => [r.selector.nodeType!, r] as const))(
    "%s pairs its fill with a text color (TPL-1697)",
    (_kind, rule) => {
      expect(
        rule.properties["color"],
        `${_kind} sets background-color but no color, so its label falls back to white`,
      ).toBeDefined();
    },
  );

  const opaque = kindRules.filter((r) => r.properties["background-color"] !== "transparent");

  it.each(opaque.map((r) => [r.selector.nodeType!, r] as const))(
    "%s keeps its label AA-legible on its own fill",
    (_kind, rule) => {
      const fill = rule.properties["background-color"];
      const text = rule.properties["color"]!;
      const ratio = contrastRatio(text, fill);
      expect(
        ratio,
        `${_kind}: color ${text} / background ${fill} must be hex colors`,
      ).toBeDefined();
      expect(
        ratio!,
        `${_kind} label ${text} on its fill ${fill} is below ${WCAG_AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );

  // A fill-less kind has no card of its own to read against: its label and its
  // border both sit on the canvas, which inside a boundary frame is wearing a
  // tint. The border is the card's only outline, so it carries the 3:1
  // non-text bar (WCAG 1.4.11) rather than a text threshold.
  const fillLess = kindRules.filter((r) => r.properties["background-color"] === "transparent");

  it("finds the fill-less kinds", () => {
    expect(fillLess.map((r) => r.selector.nodeType)).toEqual(["usecase"]);
  });

  it.each(fillLess.map((r) => [r.selector.nodeType!, r] as const))(
    "%s stays legible on the canvas and under every boundary tint",
    (_kind, rule) => {
      const text = rule.properties["color"]!;
      const border = rule.properties["border-color"];
      expect(border, `${_kind} is fill-less, so it must set a border-color`).toBeDefined();
      for (const surface of canvasSurfaces) {
        expect(
          contrastRatio(text, surface)!,
          `${_kind} label ${text} on ${surface} is below ${WCAG_AA_NORMAL_TEXT}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        // The border is this card's only outline, so it carries the non-text bar.
        expect(
          contrastRatio(border!, surface)!,
          `${_kind} border ${border} on ${surface} is below ${WCAG_AA_LARGE_TEXT}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
      }
    },
  );

  // `@deprecated` fades the whole node group to DEPRECATED_OPACITY, border
  // included. A filled card survives that because its body still marks the
  // card; a fill-less one is left with a faded outline and nothing else, so the
  // fade has to be part of what the border is calibrated against.
  //
  // Only this fade is checkable. The facet-dim (0.28) and diff-ghost (0.3)
  // states are so light that no color clears 3:1 — white is the best a border
  // can do, and over the dark canvas it reaches 2.50:1 at 0.28 and 2.70:1 at
  // 0.3 — so they are exempt by construction, which is the same carve-out
  // WCAG 1.4.11 makes for inactive components.
  const DEPRECATED_OPACITY = 0.6;

  it("the builtin @deprecated opacity is the value the fill-less border is calibrated against", () => {
    // Pins the coupling: raising the fade in the annotation rules without
    // re-checking the borders would leave this guard measuring the wrong alpha.
    const deprecated = getBuiltinStyleSheet(theme).rules.find((r) =>
      r.selector.annotations.includes("deprecated"),
    );
    expect(deprecated?.properties["opacity"]).toBe(String(DEPRECATED_OPACITY));
  });

  it.each(fillLess.map((r) => [r.selector.nodeType!, r] as const))(
    "%s keeps its outline when @deprecated fades the card",
    (_kind, rule) => {
      const border = rule.properties["border-color"]!;
      for (const surface of canvasSurfaces) {
        const faded = compositeOver(border, surface, DEPRECATED_OPACITY)!;
        expect(
          contrastRatio(faded, surface)!,
          `${_kind} border ${border} faded to ${faded} on ${surface} is below ${WCAG_AA_LARGE_TEXT}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
      }
    },
  );
});
