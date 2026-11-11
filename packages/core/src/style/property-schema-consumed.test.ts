import { describe, it, expect } from "vitest";
import { compile } from "../compile/compile.js";
import { PROPERTY_SCHEMAS } from "./property-schema.js";

// Every property the validator accepts must change what is drawn (TPL-1296).
//
// `PROPERTY_SCHEMAS` is what makes a declaration "known": a name in it is
// validated and never reported as `style-unknown-property`. A name that is
// accepted there but read by no resolver or renderer is a ghost: the author
// writes it, sees no warning and no effect (`stroke-style` before #1492).
// The spec check in `builtins/reference-spec-sync.test.ts` proves a schema
// entry is documented; this one proves it is consumed.
//
// The table is checked against the schema's keys in both directions, so a new
// schema entry fails here until it has a sample whose render differs from the
// unstyled baseline.

const MODEL = `
system Shop {
  label "Shop"
  user Buyer { label "Buyer" }
  service Web { label "Web" }
  service Api { label "Api" }
  service Billing { label "Billing" }
  service Search { label "Search" }
  service Mail { label "Mail" }
  service Ledger { label "Ledger" }
  service Legacy @deprecated { label "Legacy" }
  service Stripe [external] { label "Stripe" }
  database ShopDB { label "Shop DB" }
  Buyer -> Web "browses the catalogue and places an order with a very long label"
  Web -> Api "calls"
  Api -> ShopDB "reads"
  Api -> Billing "charges"
  Billing -> Stripe "settles"
  Api -> Search "queries"
  Api -> Mail "notifies"
  Billing -> Ledger "records"
  Api -> Legacy "falls back"
}
`;

/** A rule that sets the property to a value its default does not produce. */
const SAMPLES: Record<string, string> = {
  color: "service { color: #FF00AA; }",
  "background-color": "service { background-color: #FF00AA; }",
  "border-color": "service { border-color: #FF00AA; }",
  "border-width": "service { border-width: 7px; }",
  "border-style": "service { border-style: dotted; }",
  "border-radius": "service { border-radius: 19px; }",
  opacity: "service { opacity: 0.3; }",
  "stroke-width": "edge { stroke-width: 6px; }",
  "stroke-style": "edge { stroke-style: dotted; }",
  "font-size": "service { font-size: 23px; }",
  "font-weight": "service { font-weight: normal; }",
  "font-family": 'service { font-family: "Courier New", monospace; }',
  direction: "edge#Billing->Stripe { direction: left; }",
  column: "#Stripe { column: left; }",
  "grid-columns": "#Shop { grid-columns: 1; }",
  "label-position": "edge { label-position: start; }",
  "label-offset": "edge { label-offset: 13px 17px; }",
  "label-max-chars": "edge { label-max-chars: none; }",
  "label-display": "edge { label-display: hover; }",
  shape: "service { shape: hexagon; }",
  "badge-color": "@deprecated { badge-color: #FF00AA; }",
  "badge-icon": '@deprecated { badge-icon: "Z"; }',
  "badge-label": '@deprecated { badge-label: "Gone soon"; }',
};

describe("every PROPERTY_SCHEMAS entry is consumed (TPL-1296, #1492)", () => {
  it("has a sample for exactly the schema's properties", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(PROPERTY_SCHEMAS).sort());
  });

  const base = compile(MODEL);
  const baseline = base.svg;

  it("the model compiles cleanly, so a difference is the property's", () => {
    expect(base.diagnostics).toEqual([]);
    expect(baseline).toContain("Legacy");
  });

  it.each(Object.entries(SAMPLES))("%s changes the rendered SVG", (_property, styleSource) => {
    const result = compile(MODEL, { styleSource });
    // A sample that does not parse or validate would pass vacuously.
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings.filter((w) => w.kind.startsWith("style-"))).toEqual([]);
    expect(result.svg).not.toBe(baseline);
  });
});
