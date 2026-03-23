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

/* ── リソースタグ → シェイプ ── */
resource[table]   { shape: cylinder; }
resource[queue]   { shape: queue; }
resource[api]     { shape: hexagon; }
resource[storage] { shape: cloud; }

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
