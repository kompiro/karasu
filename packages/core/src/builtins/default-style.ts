import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";
import type { DiagramTheme } from "../renderer/palette.js";
import { REFERENCE_DATA } from "./reference-data.js";

/**
 * Translated labels for the built-in annotation badges, injected by the
 * caller per docs/spec/i18n.md (same pattern as EmptyStateLabels). Omitted
 * keys fall back to the `reference-data.ts` en labels, so the builtin
 * sheet and the Reference panel can never drift (TPL-20260519-02).
 */
export interface AnnotationBadgeLabels {
  deprecated?: string;
  new?: string;
  experimental?: string;
  migrationTarget?: string;
}

/** reference-data annotation name → AnnotationBadgeLabels key. */
const ANNOTATION_LABEL_KEYS: Record<string, keyof AnnotationBadgeLabels> = {
  deprecated: "deprecated",
  new: "new",
  experimental: "experimental",
  migration_target: "migrationTarget",
};

/**
 * Light-theme badge colors. The dark colors are the canonical
 * `reference-data.ts` `defaultBadge.color` values; light uses slightly
 * darker variants that stay legible on light cards (ADR-20260522-01).
 */
const LIGHT_BADGE_COLORS: Record<string, string> = {
  deprecated: "#DC2626",
  new: "#059669",
  experimental: "#D97706",
  migration_target: "#2563EB",
};

/** Escape a label for embedding in a double-quoted style string literal. */
function escapeStyleString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Generate the `@deprecated` / `@new` / `@experimental` /
 * `@migration_target` rule blocks from `reference-data.ts` (colors /
 * icons / en label defaults) plus optional injected labels.
 */
function buildAnnotationRules(theme: DiagramTheme, badgeLabels?: AnnotationBadgeLabels): string {
  return REFERENCE_DATA.annotations
    .map((a) => {
      const label = badgeLabels?.[ANNOTATION_LABEL_KEYS[a.name]] ?? a.defaultBadge.label.en;
      const color =
        theme === "light"
          ? (LIGHT_BADGE_COLORS[a.name] ?? a.defaultBadge.color)
          : a.defaultBadge.color;
      const extra = a.name === "deprecated" ? "\n  opacity: 0.6;" : "";
      return `@${a.name} {
  badge-color: ${color};
  badge-icon: "${a.defaultBadge.icon}";
  badge-label: "${escapeStyleString(label)}";${extra}
}`;
    })
    .join("\n\n");
}

const ANNOTATION_RULES_PLACEHOLDER = "/* __ANNOTATION_RULES__ */";

/**
 * karasu built-in default theme (dark) — template whose annotation section
 * is a placeholder filled by {@link buildBuiltinStyleSource}.
 * This is the single source of truth for all default styling.
 * Applied as the lowest-priority cascade layer — user stylesheets override these.
 */
const BUILTIN_STYLE_TEMPLATE: string = `/* karasu built-in default theme */

/* ── ノード種別 ── */
user {
  background-color: #1D4ED8;
  color: #FFFFFF;
  border-color: #1E40AF;
  border-width: 2;
  shape: user;
  font-weight: bold;
  font-size: 13;
}

service {
  background-color: #0369A1;
  color: #FFFFFF;
  border-color: #075985;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

client {
  background-color: #6D28D9;
  color: #FFFFFF;
  border-color: #5B21B6;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

domain {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

usecase {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

resource {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 2;
  font-size: 12;
}

team {
  background-color: #065F46;
  color: #D1FAE5;
  border-color: #047857;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

member {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: user;
  font-size: 12;
}

/* ── インフラリソース種別 ── */
database {
  background-color: #1C3A2E;
  color: #86EFAC;
  border-color: #166534;
  border-width: 2;
  shape: cylinder;
  font-weight: bold;
  font-size: 13;
}

queue {
  background-color: #2D2310;
  color: #FCD34D;
  border-color: #92400E;
  border-width: 2;
  shape: queue;
  font-weight: bold;
  font-size: 13;
}

storage {
  background-color: #1E2A3B;
  color: #93C5FD;
  border-color: #1D4ED8;
  border-width: 2;
  shape: cloud;
  font-weight: bold;
  font-size: 13;
}

/* ── リソースタグ → シェイプ ── */
resource[table]   { shape: cylinder; }
resource[queue]   { shape: queue; }
resource[api]     { shape: hexagon; }
resource[storage] { shape: cloud; }

/* ── デプロイノード種別 ── */
oci {
  background-color: #1E3A5F;
  border-color: #3B82F6;
  badge-label: "oci";
  badge-color: #3B82F6;
}

lambda {
  background-color: #3B1F5F;
  border-color: #A855F7;
  badge-label: "lambda";
  badge-color: #A855F7;
}

jar {
  background-color: #1F3B2A;
  border-color: #22C55E;
  badge-label: "jar";
  badge-color: #22C55E;
}

war {
  background-color: #3B2A1F;
  border-color: #F97316;
  badge-label: "war";
  badge-color: #F97316;
}

function {
  background-color: #2D3B1F;
  border-color: #EAB308;
  badge-label: "function";
  badge-color: #EAB308;
}

assets {
  background-color: #1F3B3B;
  border-color: #06B6D4;
  badge-label: "assets";
  badge-color: #06B6D4;
}

job {
  background-color: #3B2222;
  border-color: #EF4444;
  badge-label: "job";
  badge-color: #EF4444;
}

artifact {
  background-color: #2D2D2D;
  border-color: #9CA3AF;
  badge-label: "artifact";
  badge-color: #9CA3AF;
}

/* ── タグ ── */
[external] {
  background-color: #1F2937;
  border-style: dashed;
}

/* ── アノテーション ── */
/* __ANNOTATION_RULES__ */

/* ── エッジ ── */
edge {
  color: #94A3B8;
  stroke-width: 1.5;
  font-size: 11;
  direction: auto;
}

edge[async] {
  border-style: dashed;
}

edge[write] {
  stroke-width: 2;
}

edge[cyclic] {
  color: #EF4444;
  stroke-width: 2.5;
}

edge[implicit] {
  color: #F59E0B;
}

edge[delivers] {
  color: #8B5CF6;
  border-style: dashed;
}
`;

/**
 * karasu built-in theme — light variant (template, see
 * {@link BUILTIN_STYLE_TEMPLATE}).
 *
 * Mirrors the dark template rule-for-rule but with node/edge colors that
 * read well on a light canvas: lighter, less saturated backgrounds, dark
 * text, and slightly darker borders. Badge / accent colors stay saturated
 * so badges remain legible on light cards.
 *
 * Cascade position is identical to the dark sheet (lowest layer); user
 * `.krs.style` still wins. See ADR-20260522-01.
 */
const BUILTIN_STYLE_TEMPLATE_LIGHT: string = `/* karasu built-in default theme (light) */

/* ── ノード種別 ── */
user {
  background-color: #DBEAFE;
  color: #1E3A8A;
  border-color: #93C5FD;
  border-width: 2;
  shape: user;
  font-weight: bold;
  font-size: 13;
}

service {
  background-color: #E0F2FE;
  color: #0C4A6E;
  border-color: #7DD3FC;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

client {
  background-color: #EDE9FE;
  color: #4C1D95;
  border-color: #C4B5FD;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

domain {
  background-color: #F0F9FF;
  color: #0C4A6E;
  border-color: #BAE6FD;
  border-width: 1;
  shape: box;
  font-size: 12;
}

usecase {
  background-color: #F0F9FF;
  color: #0C4A6E;
  border-color: #BAE6FD;
  border-width: 1;
  shape: box;
  font-size: 12;
}

resource {
  background-color: #F0F9FF;
  color: #0C4A6E;
  border-color: #BAE6FD;
  border-width: 2;
  font-size: 12;
}

team {
  background-color: #D1FAE5;
  color: #064E3B;
  border-color: #6EE7B7;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

member {
  background-color: #F0F9FF;
  color: #0C4A6E;
  border-color: #BAE6FD;
  border-width: 1;
  shape: user;
  font-size: 12;
}

/* ── インフラリソース種別 ── */
database {
  background-color: #DCFCE7;
  color: #14532D;
  border-color: #86EFAC;
  border-width: 2;
  shape: cylinder;
  font-weight: bold;
  font-size: 13;
}

queue {
  background-color: #FEF3C7;
  color: #78350F;
  border-color: #FCD34D;
  border-width: 2;
  shape: queue;
  font-weight: bold;
  font-size: 13;
}

storage {
  background-color: #DBEAFE;
  color: #1E3A8A;
  border-color: #93C5FD;
  border-width: 2;
  shape: cloud;
  font-weight: bold;
  font-size: 13;
}

/* ── リソースタグ → シェイプ ── */
resource[table]   { shape: cylinder; }
resource[queue]   { shape: queue; }
resource[api]     { shape: hexagon; }
resource[storage] { shape: cloud; }

/* ── デプロイノード種別 ── */
oci {
  background-color: #DBEAFE;
  border-color: #3B82F6;
  badge-label: "oci";
  badge-color: #3B82F6;
}

lambda {
  background-color: #F3E8FF;
  border-color: #A855F7;
  badge-label: "lambda";
  badge-color: #A855F7;
}

jar {
  background-color: #DCFCE7;
  border-color: #22C55E;
  badge-label: "jar";
  badge-color: #22C55E;
}

war {
  background-color: #FFEDD5;
  border-color: #F97316;
  badge-label: "war";
  badge-color: #F97316;
}

function {
  background-color: #FEF9C3;
  border-color: #EAB308;
  badge-label: "function";
  badge-color: #EAB308;
}

assets {
  background-color: #CFFAFE;
  border-color: #06B6D4;
  badge-label: "assets";
  badge-color: #06B6D4;
}

job {
  background-color: #FEE2E2;
  border-color: #EF4444;
  badge-label: "job";
  badge-color: #EF4444;
}

artifact {
  background-color: #F3F4F6;
  border-color: #9CA3AF;
  badge-label: "artifact";
  badge-color: #9CA3AF;
}

/* ── タグ ── */
[external] {
  background-color: #F3F4F6;
  border-style: dashed;
}

/* ── アノテーション ── */
/* __ANNOTATION_RULES__ */

/* ── エッジ ── */
edge {
  color: #64748B;
  stroke-width: 1.5;
  font-size: 11;
  direction: auto;
}

edge[async] {
  border-style: dashed;
}

edge[write] {
  stroke-width: 2;
}

edge[cyclic] {
  color: #DC2626;
  stroke-width: 2.5;
}

edge[implicit] {
  color: #D97706;
}

edge[delivers] {
  color: #7C3AED;
  border-style: dashed;
}
`;

/** Assemble the full builtin sheet source for a theme + injected labels. */
export function buildBuiltinStyleSource(
  theme: DiagramTheme = "dark",
  badgeLabels?: AnnotationBadgeLabels,
): string {
  const template = theme === "light" ? BUILTIN_STYLE_TEMPLATE_LIGHT : BUILTIN_STYLE_TEMPLATE;
  return template.replace(ANNOTATION_RULES_PLACEHOLDER, buildAnnotationRules(theme, badgeLabels));
}

/**
 * Full builtin sheet text with the default (reference-data en) badge
 * labels. Kept as exported constants for the Reference panel
 * (`reference.ts`) and tests that inspect the sheet text.
 */
export const BUILTIN_STYLE_SOURCE: string = buildBuiltinStyleSource("dark");
export const BUILTIN_STYLE_SOURCE_LIGHT: string = buildBuiltinStyleSource("light");

// Parsed-sheet cache keyed by (theme, badge label set). The label space is
// the caller's locale table, so the cache stays tiny (themes × locales).
const _sheetCache = new Map<string, StyleSheet>();

function sheetCacheKey(theme: DiagramTheme, badgeLabels?: AnnotationBadgeLabels): string {
  // JSON.stringify gives an unambiguous key — a join() separator could
  // collide with a separator-containing label from an external caller.
  return JSON.stringify([
    theme,
    badgeLabels?.deprecated ?? "",
    badgeLabels?.new ?? "",
    badgeLabels?.experimental ?? "",
    badgeLabels?.migrationTarget ?? "",
  ]);
}

/**
 * Return the built-in `.krs.style` sheet for the given theme and optional
 * injected annotation badge labels. `"dark"` + default labels is the
 * legacy fast path; existing callers that pass nothing are unchanged.
 */
export function getBuiltinStyleSheet(
  theme: DiagramTheme = "dark",
  badgeLabels?: AnnotationBadgeLabels,
): StyleSheet {
  const key = sheetCacheKey(theme, badgeLabels);
  let sheet = _sheetCache.get(key);
  if (!sheet) {
    sheet = parseBuiltinSheet(buildBuiltinStyleSource(theme, badgeLabels));
    _sheetCache.set(key, sheet);
  }
  return sheet;
}

function parseBuiltinSheet(source: string): StyleSheet {
  const result = StyleParser.parse(source, "<builtin>");
  /* c8 ignore next 4 */
  if (result.diagnostics.length > 0) {
    throw new Error(
      `Built-in stylesheet has parse errors: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  }
  return result.value;
}
