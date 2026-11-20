import type { DiagramTheme } from "../renderer/palette.js";
import { REFERENCE_DATA } from "./reference-data.js";

/**
 * Translated labels for the built-in annotation badges, injected by the
 * caller per docs/spec/i18n.md (same pattern as EmptyStateLabels). Omitted
 * keys fall back to the `reference-data.ts` en labels, so the builtin
 * sheet and the Reference panel can never drift (TPL-1415).
 */
export interface AnnotationBadgeLabels {
  deprecated?: string;
  new?: string;
  experimental?: string;
  draft?: string;
  planned?: string;
  migrationTarget?: string;
}

/** reference-data annotation name → AnnotationBadgeLabels key. */
export const ANNOTATION_LABEL_KEYS: Record<string, keyof AnnotationBadgeLabels> = {
  deprecated: "deprecated",
  new: "new",
  experimental: "experimental",
  draft: "draft",
  planned: "planned",
  migration_target: "migrationTarget",
};

/** Escape a label for embedding in a double-quoted style string literal. */
function escapeStyleString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Generate the `@deprecated` / `@new` / `@experimental` / `@draft` /
 * `@planned` / `@migration_target` rule blocks from `reference-data.ts` (colors /
 * icons / en label defaults) plus optional injected labels.
 */
export function buildAnnotationRules(
  theme: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
): string {
  return REFERENCE_DATA.annotations
    .map((a) => {
      const label = badgeLabels?.[ANNOTATION_LABEL_KEYS[a.name]] ?? a.defaultBadge.label.en;
      // Both palettes come from `reference-data.ts`, so the Reference panel's
      // swatch and this sheet cannot disagree about what the theme paints
      // (#2482; same single-source reasoning as the labels above, TPL-1415).
      const color = a.defaultBadge.color[theme];
      const extra = a.name === "deprecated" ? "\n  opacity: 0.6;" : "";
      return `@${a.name} {
  badge-color: ${color};
  badge-icon: "${a.defaultBadge.icon}";
  badge-label: "${escapeStyleString(label)}";${extra}
}`;
    })
    .join("\n\n");
}
