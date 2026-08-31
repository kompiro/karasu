import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { buildFacetOverview } from "./facet-overview.js";
import { compile } from "../index.js";

// The derived audit view for `facet` (#2177).
//
// Two properties matter more than the shape of the payload. It must be
// *derived* — no authored second copy that can drift (TPL-1032) — and it must
// keep two same-named nodes in different scopes apart, because the index it
// would be easiest to build this from cannot (TPL-1352, ADR-927).

function parse(source: string) {
  const { value, diagnostics } = Parser.parse(source);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return value;
}

describe("buildFacetOverview", () => {
  it("lists the elements that declare each facet", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "Personal data" }
        facet pci { label "Cardholder data" }
        system Shop {
          service Accounts { facets pii }
          service Checkout { facets pii, pci }
          service Catalogue {}
        }
      `),
    );
    const pii = overview.find((f) => f.id === "pii");
    expect(pii?.members.map((m) => m.id)).toEqual(["Accounts", "Checkout"]);
    expect(overview.find((f) => f.id === "pci")?.members.map((m) => m.id)).toEqual(["Checkout"]);
  });

  it("carries the declaration's metadata, so an audit can reach the policy", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pci {
          label "Cardholder data"
          description "In scope for the annual assessment"
          link "https://example.com/pci" "PCI policy"
        }
        system Shop { service Checkout { facets pci } }
      `),
    );
    expect(overview[0].label).toBe("Cardholder data");
    expect(overview[0].description).toBe("In scope for the annual assessment");
    expect(overview[0].links).toEqual([{ url: "https://example.com/pci", label: "PCI policy" }]);
    expect(overview[0].declared).toBe(true);
  });

  it("keeps two same-named nodes in different scopes apart (TPL-1352)", () => {
    // The whole reason this walks declaration sites instead of reading
    // `facetIndex`: that index keys on the bare id, so both `Payment` nodes
    // would collapse into one row carrying the union of their facets — an
    // audit list that is wrong in exactly the situation it exists for.
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        facet pci { label "PCI" }
        system Shop {
          service Web {
            domain Payment { facets pii }
          }
          service Api {
            domain Payment { facets pci }
          }
        }
      `),
    );
    const pii = overview.find((f) => f.id === "pii")!;
    const pci = overview.find((f) => f.id === "pci")!;
    expect(pii.members).toHaveLength(1);
    expect(pci.members).toHaveLength(1);
    expect(pii.members[0].path).toEqual(["Shop", "Web"]);
    expect(pci.members[0].path).toEqual(["Shop", "Api"]);
    // And neither picked up the other's facet.
    expect(pii.members[0].id).toBe("Payment");
    expect(pci.members[0].id).toBe("Payment");
  });

  it("reports a referenced-but-undeclared facet with no members lost", () => {
    const overview = buildFacetOverview(
      parse(`
        system Shop { service Checkout { facets pcl } }
      `),
    );
    expect(overview).toHaveLength(1);
    expect(overview[0].id).toBe("pcl");
    expect(overview[0].declared).toBe(false);
    expect(overview[0].members.map((m) => m.id)).toEqual(["Checkout"]);
  });

  it("lists a declared facet nobody joined, with an empty member list", () => {
    // Silently omitting it would make "declared but unused" indistinguishable
    // from "does not exist" — which is the question an audit is asking.
    const overview = buildFacetOverview(parse(`facet pii { label "PII" }\nsystem Shop {}\n`));
    expect(overview.map((f) => f.id)).toEqual(["pii"]);
    expect(overview[0].members).toEqual([]);
  });

  it("carries each member's kind and label", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        system Shop {
          database ProfileStore { label "Profile store" facets pii }
        }
      `),
    );
    expect(overview[0].members[0]).toMatchObject({
      id: "ProfileStore",
      label: "Profile store",
      kind: "database",
    });
  });

  it("collapses a facet repeated on one element into one row", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        system Shop {
          service Accounts {
            facets pii
            facets pii
          }
        }
      `),
    );
    expect(overview[0].members).toHaveLength(1);
  });

  it("reaches elements declared outside a system block", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        service Orphan { facets pii }
        database Loose { facets pii }
      `),
    );
    expect(overview[0].members.map((m) => m.id).sort()).toEqual(["Loose", "Orphan"]);
  });

  it("is empty for a model with no facets at all", () => {
    expect(buildFacetOverview(parse(`system Shop { service A {} }`))).toEqual([]);
  });

  // Slice B (#2544). The panel answers "what is in PCI scope?", and after edges
  // took the property an answer that listed only nodes would name the endpoints
  // while leaving out the flow between them — the fact edge membership exists
  // to record.
  it("lists an edge that declares the facet", () => {
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        system Shop {
          service Api {}
          service Billing {}
          Api --> Billing "charge" { facets pii }
        }
      `),
    );
    // The id is the canonical base form, which is exactly what `edge#<id>`
    // addresses the same edge with — so a row can be pasted into a selector.
    expect(overview[0].members).toEqual([
      { id: "Api-->Billing", label: "charge", kind: "edge", path: ["Shop"] },
    ]);
  });

  it("keeps two same-arrow edges in different scopes apart (TPL-1352)", () => {
    // The same reason node rows carry a path: an edge is identified by the
    // block that declares it, not by its arrow form alone.
    const overview = buildFacetOverview(
      parse(`
        facet pii { label "PII" }
        system Left {
          service Api {}
          service Billing {}
          Api -> Billing { facets pii }
        }
        system Right {
          service Api {}
          service Billing {}
          Api -> Billing { facets pii }
        }
      `),
    );
    expect(overview[0].members.map((m) => m.path.join("/"))).toEqual(["Left", "Right"]);
  });

  it("names a facet held only by an edge, with no node member anywhere", () => {
    // `knownFacetIds` has to see edge references or this facet would have no
    // row, no colour and no toolbar entry — accepted vocabulary with no effect.
    const overview = buildFacetOverview(
      parse(`
        system Shop {
          service Api {}
          service Billing {}
          Api -> Billing { facets edgeonly }
        }
      `),
    );
    expect(overview.map((f) => f.id)).toEqual(["edgeonly"]);
    expect(overview[0].declared).toBe(false);
    expect(overview[0].members.map((m) => m.kind)).toEqual(["edge"]);
  });

  it("orders facets the same way the overlay assigns colours", () => {
    // Declared first, then reference-only — the `knownFacetIds` order. If the
    // panel ordered differently, its swatch and the diagram's ring would be
    // different colours for the same facet.
    const overview = buildFacetOverview(
      parse(`
        facet zeta { label "Z" }
        facet alpha { label "A" }
        system Shop { service S { facets undeclared } }
      `),
    );
    expect(overview.map((f) => f.id)).toEqual(["zeta", "alpha", "undeclared"]);
  });
});

describe("compile reports the overview", () => {
  it("exposes facetOverview on the system compile result", () => {
    const result = compile(
      `facet pii { label "PII" }\nsystem Shop { service A { facets pii } }\n`,
      { diagramType: "system" },
    );
    if (result.diagramType !== "system") throw new Error("expected a system result");
    expect(result.facetOverview.map((f) => f.id)).toEqual(["pii"]);
    expect(result.facetOverview[0].members.map((m) => m.id)).toEqual(["A"]);
  });

  it("agrees with `facets` on ids and order — one derivation, two views", () => {
    const result = compile(
      `facet pii { label "PII" }\nfacet pci { label "PCI" }\nsystem Shop { service A { facets pci } }\n`,
      { diagramType: "system" },
    );
    if (result.diagramType !== "system") throw new Error("expected a system result");
    expect(result.facetOverview.map((f) => f.id)).toEqual(result.facets.map((f) => f.id));
  });
});
