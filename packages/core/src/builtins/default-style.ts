import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";

/**
 * karasu built-in default theme.
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
  badge-label: "非推奨";
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
  badge-label: "実験的";
}

@migration-target {
  badge-color: #3B82F6;
  badge-icon: "→";
  badge-label: "移行先";
}

/* ── エッジ ── */
edge {
  color: #94A3B8;
  stroke-width: 1.5;
  font-size: 11;
}

edge[async] {
  border-style: dashed;
}
`;

// Reset cache whenever this module is reloaded or in tests
let _cachedSheet: StyleSheet | null = null;

export function getBuiltinStyleSheet(): StyleSheet {
  if (!_cachedSheet) {
    const result = StyleParser.parse(BUILTIN_STYLE_SOURCE);
    if (result.diagnostics.length > 0) {
      throw new Error(
        `Built-in stylesheet has parse errors: ${result.diagnostics.map((d) => d.message).join(", ")}`,
      );
    }
    _cachedSheet = result.value;
  }
  return _cachedSheet;
}
