import { describe, it, expect } from "vitest";
import { compile } from "../compile/compile.js";
import { PROPERTY_SCHEMAS, type ValueSpec } from "./property-schema.js";

/**
 * TPL-3141: a style value's diagnostic describes what is drawn. Bounds live in
 * `PROPERTY_SCHEMAS` only, and a declaration outside them is dropped once, in
 * the cascade. This guard is derived from the table, so a bound added there is
 * covered here without anyone writing a case for it: an out-of-range value
 * must be reported once per declaration and draw exactly what the sheet draws
 * without it.
 */

interface Bound {
  kind: "number" | "length";
  min?: number;
  max?: number;
  integer?: boolean;
}

function boundsOf(spec: ValueSpec): Bound[] {
  switch (spec.kind) {
    case "number":
      return spec.min !== undefined || spec.max !== undefined || spec.integer ? [spec] : [];
    case "length":
      return spec.min !== undefined ? [spec] : [];
    case "union":
      return spec.specs.flatMap(boundsOf);
    case "list-of":
    case "sequence-of":
      return boundsOf(spec.item);
    default:
      return [];
  }
}

/** Values just outside `bound`, written as the author would. */
function outside(bound: Bound): string[] {
  const n: number[] = [];
  if (bound.min !== undefined) n.push(bound.min - 1);
  if (bound.max !== undefined) n.push(bound.max + 1);
  if (bound.kind === "number" && bound.integer) n.push((bound.min ?? 0) + 1.5);
  return n.map((v) => (bound.kind === "length" ? `${v}px` : `${v}`));
}

const CASES = Object.entries(PROPERTY_SCHEMAS).flatMap(([property, spec]) =>
  boundsOf(spec).flatMap((bound) => outside(bound).map((value) => [property, value] as const)),
);

const KRS = `system S {
  service A {}
  service B {}
  A -> B "calls"
}
`;

// One rule per kind of thing a property can paint: a node, an edge, and the
// system's frame. Each declares the property once.
const SELECTORS = ["service", "edge", "system"];
const sheet = (body: string) => SELECTORS.map((s) => `${s} { ${body} }`).join("\n");

const BASELINE = "color: #123456;";

function render(styleSource: string) {
  const result = compile(KRS, { styleSource });
  return {
    svg: result.svg,
    styleWarnings: result.warnings.filter((w) => w.kind.startsWith("style-")),
  };
}

describe("TPL-3141: every bound in PROPERTY_SCHEMAS drops an out-of-range value once", () => {
  it("covers every bounded property in the table", () => {
    const covered = new Set(CASES.map(([property]) => property));
    for (const property of [
      "opacity",
      "border-width",
      "label-position",
      "grid-columns",
      "label-max-chars",
    ]) {
      expect(covered).toContain(property);
    }
  });

  it.each(CASES)("%s: %s", (property, value) => {
    const without = render(sheet(BASELINE));
    const withIt = render(sheet(`${BASELINE} ${property}: ${value};`));
    // (a) one finding per declaration written, none per node it would touch.
    expect(withIt.styleWarnings).toHaveLength(without.styleWarnings.length + SELECTORS.length);
    // (b) drawn as if the declaration were not there.
    expect(withIt.svg).toBe(without.svg);
  });
});
