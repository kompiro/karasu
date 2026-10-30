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
 *
 * This table is the only place a value's bounds are written (#3141). A
 * declaration in an author sheet whose value fails its spec is dropped from
 * the cascade (`flattenSheetsInCascadeOrder`) and reported once by the
 * validator; the resolver reads only declarations that passed, so it states
 * no bound of its own.
 *
 * A comma separates `list-of` items; spaces separate `sequence-of` items. The
 * two never stand in for each other: `label-offset: 4px, 8px` is not an offset.
 */
export type ValueSpec =
  | { kind: "ident-of"; values: readonly string[] }
  /** Any identifier — an unquoted font name word. */
  | { kind: "ident" }
  | { kind: "hex" }
  | { kind: "number"; min?: number; max?: number; integer?: boolean }
  /** A number with one of `allowedUnits`, or a unitless `0` (as in CSS). */
  | { kind: "length"; allowedUnits: readonly string[]; min?: number }
  | { kind: "string" }
  | { kind: "url" }
  | { kind: "list-of"; item: ValueSpec }
  /** One atom, or a space-separated `sequence`, of `minItems`..`maxItems` items. */
  | { kind: "sequence-of"; item: ValueSpec; minItems: number; maxItems?: number }
  | { kind: "union"; specs: readonly ValueSpec[] }
  | { kind: "any" };

const COLOR_SPEC: ValueSpec = {
  kind: "union",
  specs: [{ kind: "hex" }, { kind: "ident-of", values: CSS_NAMED_COLORS }],
};

const LENGTH_PX_SPEC: ValueSpec = { kind: "length", allowedUnits: ["px"] };
// A width, a radius or a size: a negative one has no drawing (#3032).
const NON_NEGATIVE_LENGTH_PX_SPEC: ValueSpec = { kind: "length", allowedUnits: ["px"], min: 0 };

const SHAPE_KIND_VALUES = ["box", "user", "cylinder", "queue", "hexagon", "cloud"] as const;

// A quoted name, or an unquoted one of one or more words (`Noto Sans`), as in
// CSS. The generic families (`sans-serif`, …) are such words too.
const FONT_FAMILY_ITEM_SPEC: ValueSpec = {
  kind: "union",
  specs: [{ kind: "string" }, { kind: "sequence-of", item: { kind: "ident" }, minItems: 1 }],
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
  "border-width": NON_NEGATIVE_LENGTH_PX_SPEC,
  "border-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },
  "border-radius": NON_NEGATIVE_LENGTH_PX_SPEC,
  opacity: { kind: "number", min: 0, max: 1 },
  "stroke-width": NON_NEGATIVE_LENGTH_PX_SPEC,
  "stroke-style": { kind: "ident-of", values: ["solid", "dashed", "dotted"] },

  // Typography
  "font-size": NON_NEGATIVE_LENGTH_PX_SPEC,
  "font-weight": { kind: "ident-of", values: ["normal", "bold"] },
  "font-family": { kind: "list-of", item: FONT_FAMILY_ITEM_SPEC },

  // Layout (karasu-specific)
  direction: { kind: "ident-of", values: ["auto", "up", "down", "left", "right"] },
  column: { kind: "ident-of", values: ["left", "center", "right"] },
  "grid-columns": { kind: "number", min: 1, integer: true },
  "label-position": {
    kind: "union",
    specs: [
      { kind: "ident-of", values: ["start", "middle", "end"] },
      { kind: "number", min: 0, max: 1 },
    ],
  },
  // `<dy>px` or `<dx>px <dy>px` (ADR-1184). A third length is rejected rather
  // than ignored.
  "label-offset": { kind: "sequence-of", item: LENGTH_PX_SPEC, minItems: 1, maxItems: 2 },
  // The canvas tier of edge-label disclosure (#3022).
  "label-max-chars": {
    kind: "union",
    specs: [
      { kind: "ident-of", values: ["none"] },
      { kind: "number", min: 1, integer: true },
    ],
  },
  "label-display": { kind: "ident-of", values: ["always", "auto", "hover"] },

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
