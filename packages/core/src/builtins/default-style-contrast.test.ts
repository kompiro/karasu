import { describe, it, expect } from "vitest";
import { getBuiltinStyleSheet } from "./default-style.js";
import { resolvePalette, type DiagramTheme } from "../renderer/palette.js";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../renderer/contrast.js";
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
    // 9 deploy kinds + database[index] + 5 annotations = 15 as of #2366.
    // Exact so a badge rule dropped from BOTH themes cannot silently
    // shrink this guard's coverage; update the arithmetic when adding one.
    expect(badgeRules.length).toBe(15);
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
});
