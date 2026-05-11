import { CSS_NAMED_COLORS } from "./css-named-colors.js";

/**
 * Per-property value spec used by the value-level validator (Phase 3 /
 * PR-B). Each spec describes the shape of a valid value for one
 * property in `.krs.style`. Properties not present in
 * `PROPERTY_SCHEMAS` trigger a `style-unknown-property` warning.
 *
 * The `union` case lets a property accept any of several spec shapes
 * (e.g. `shape` is `ident-of {box,user,...} | url(...)`; `color` is
 * `hex | ident-of {CSS named colors}`). The validator tries each spec
 * in order and treats the first match as a success.
 */
export type ValueSpec =
  | { kind: "ident-of"; values: readonly string[] }
  | { kind: "hex" }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "length"; allowedUnits: readonly string[] }
  | { kind: "string" }
  | { kind: "url" }
  | { kind: "list-of"; item: ValueSpec }
  | { kind: "union"; specs: readonly ValueSpec[] }
  | { kind: "any" };

const COLOR_SPEC: ValueSpec = {
  kind: "union",
  specs: [{ kind: "hex" }, { kind: "ident-of", values: CSS_NAMED_COLORS }],
};

const LENGTH_PX_SPEC: ValueSpec = { kind: "length", allowedUnits: ["px"] };

const SHAPE_KIND_VALUES = ["box", "user", "cylinder", "queue", "hexagon", "cloud"] as const;

const FONT_FAMILY_ITEM_SPEC: ValueSpec = {
  kind: "union",
  specs: [{ kind: "string" }, { kind: "ident-of", values: ["sans-serif", "serif", "monospace"] }],
};

/**
 * Mapping from property name to its value spec. Keep in sync with
 * `docs/spec/style.md` — a property documented in the spec but missing
 * here will surface as `style-unknown-property` warnings even though
 * the resolver may handle it. The validator treats the absence of an
 * entry as "unknown property" by design (Phase 3 design Q2 — warning).
 */
export const PROPERTY_SCHEMAS: Record<string, ValueSpec> = {
  // Visual
  color: COLOR_SPEC,
  "background-color": COLOR_SPEC,
  "border-color": COLOR_SPEC,
  "border-width": LENGTH_PX_SPEC,
  "border-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },
  "border-radius": LENGTH_PX_SPEC,
  opacity: { kind: "number", min: 0, max: 1 },
  "stroke-width": LENGTH_PX_SPEC,
  "stroke-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },

  // Typography
  "font-size": LENGTH_PX_SPEC,
  "font-weight": { kind: "ident-of", values: ["normal", "bold"] },
  "font-family": { kind: "list-of", item: FONT_FAMILY_ITEM_SPEC },

  // Layout (karasu-specific)
  direction: { kind: "ident-of", values: ["auto", "up", "down", "left", "right"] },
  column: { kind: "ident-of", values: ["left", "center", "right"] },

  // karasu-specific (badges, shape)
  shape: {
    kind: "union",
    specs: [{ kind: "ident-of", values: SHAPE_KIND_VALUES }, { kind: "url" }],
  },
  "badge-color": COLOR_SPEC,
  "badge-icon": { kind: "string" },
  "badge-label": { kind: "string" },
};

/**
 * O(1) check whether the validator knows about a given property name.
 * `false` means the property name is unknown and the validator should
 * emit `style-unknown-property` warning rather than try any spec.
 */
export function isKnownProperty(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROPERTY_SCHEMAS, name);
}
