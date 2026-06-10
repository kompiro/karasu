import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";
import type { DiagramTheme } from "../renderer/palette.js";

/**
 * karasu built-in default theme (dark).
 * This is the single source of truth for all default styling.
 * Applied as the lowest-priority cascade layer — user stylesheets override these.
 */
export const BUILTIN_STYLE_SOURCE: string = `/* karasu built-in default theme */

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
@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "Deprecated";
  opacity: 0.6;
}

@new {
  badge-color: #10B981;
  badge-icon: "✦";
  badge-label: "NEW";
}

@experimental {
  badge-color: #F59E0B;
  badge-icon: "⚗";
  badge-label: "Experimental";
}

@migration_target {
  badge-color: #3B82F6;
  badge-icon: "→";
  badge-label: "Migration target";
}

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
 * karasu built-in theme — light variant.
 *
 * Mirrors {@link BUILTIN_STYLE_SOURCE} rule-for-rule but with node/edge
 * colors that read well on a light canvas: lighter, less saturated
 * backgrounds, dark text, and slightly darker borders. Badge / accent
 * colors stay saturated so badges remain legible on light cards.
 *
 * Cascade position is identical to the dark sheet (lowest layer); user
 * `.krs.style` still wins. See `docs/design/svg-diagram-theming.md`.
 */
export const BUILTIN_STYLE_SOURCE_LIGHT: string = `/* karasu built-in default theme (light) */

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
@deprecated {
  badge-color: #DC2626;
  badge-icon: "⚠";
  badge-label: "Deprecated";
  opacity: 0.6;
}

@new {
  badge-color: #059669;
  badge-icon: "✦";
  badge-label: "NEW";
}

@experimental {
  badge-color: #D97706;
  badge-icon: "⚗";
  badge-label: "Experimental";
}

@migration_target {
  badge-color: #2563EB;
  badge-icon: "→";
  badge-label: "Migration target";
}

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

// Cache both theme variants separately so neither path re-parses on every
// call and the dark cache (the legacy fast path) is never invalidated by a
// light-theme request.
let _cachedSheetDark: StyleSheet | null = null;
let _cachedSheetLight: StyleSheet | null = null;

/**
 * Return the built-in `.krs.style` sheet for the given theme. `"dark"` is
 * the default; existing callers that pass nothing get the legacy sheet.
 */
export function getBuiltinStyleSheet(theme: DiagramTheme = "dark"): StyleSheet {
  if (theme === "light") {
    if (!_cachedSheetLight) {
      _cachedSheetLight = parseBuiltinSheet(BUILTIN_STYLE_SOURCE_LIGHT);
    }
    return _cachedSheetLight;
  }
  if (!_cachedSheetDark) {
    _cachedSheetDark = parseBuiltinSheet(BUILTIN_STYLE_SOURCE);
  }
  return _cachedSheetDark;
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
