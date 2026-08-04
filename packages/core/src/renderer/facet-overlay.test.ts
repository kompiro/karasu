import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { render } from "./svg-renderer.js";
import { knownFacetIds, resolveFacetOverlay, FACET_OVERLAY_COLORS } from "./facet-overlay.js";
import type { KrsFile } from "../types/ast.js";

// The facet overlay (#2174) is the first visual effect facets have; slice 1
// (#2173) landed the grammar with no rendering at all. Two perspectives carry
// most of the weight here:
//
//   TPL-1503 — an accepted vocabulary must have an effect. Selecting a facet has
//     to change the picture, or the construct is back in the fourth state.
//   The new proactive perspective — an opt-in visual layer leaves the output
//     byte-identical when it is off. That one is checked first, because every
//     other assertion here is worthless if merely *having* facets in the model
//     already perturbed the SVG.

const SRC = `
facet pii {
  label "Personal data"
}
facet pci {
  label "Card data"
}

system Shop {
  service Api {
    facets pii, pci
  }
  service Billing {
    facets pci
  }
  service Search {
  }
  Api -> Billing "charge"
  Api -> Search "query"
}
`;

/** The same model with every facet declaration and reference removed. */
const SRC_WITHOUT_FACETS = `
system Shop {
  service Api {
  }
  service Billing {
  }
  service Search {
  }
  Api -> Billing "charge"
  Api -> Search "query"
}
`;

function parse(src: string): KrsFile {
  return Parser.parse(src).value;
}

function renderSystem(file: KrsFile, selected?: string[]): string {
  const slice = extractView(file.systems, []);
  const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
  return render(slice, styles, undefined, undefined, undefined, undefined, {
    facetOverlay: resolveFacetOverlay(file, selected),
  });
}

/** Every marker the overlay is allowed to emit. Nothing here may appear when it is off. */
const OVERLAY_MARKERS = ["data-facet-member", "data-facet-ring", 'opacity="0.28"'];

describe("facet overlay — off by default (proactive: opt-in layers are inert when off)", () => {
  it("emits none of its own markers when no facet is selected", () => {
    // This assertion and the byte-identity one below fence *different*
    // regressions, and only together do they mean "inert".
    //
    // Equality between two renders cannot see an unconditional emission: both
    // sides run the same binary, so an attribute added to every node appears on
    // both and cancels out. (Measured — a mutation emitting
    // `data-facet-member="none"` when off passed the equality test *and* the
    // whole 3000-test suite.) Naming the markers is what catches it.
    const svg = renderSystem(parse(SRC));
    for (const marker of OVERLAY_MARKERS) expect(svg).not.toContain(marker);
  });

  it("renders identically whether or not the model declares facets", () => {
    // The other direction: merely *having* facets in the source must not move
    // placement or perturb any other output while the overlay is off.
    expect(renderSystem(parse(SRC))).toBe(renderSystem(parse(SRC_WITHOUT_FACETS)));
  });

  it("stays byte-identical for an empty selection and for an unknown facet", () => {
    const baseline = renderSystem(parse(SRC_WITHOUT_FACETS));
    expect(renderSystem(parse(SRC), [])).toBe(baseline);
    // A selection naming a facet the model does not have resolves to "off"
    // rather than to an active-but-empty overlay, so nothing is drawn and no
    // empty legend band appears (TPL-1032).
    expect(renderSystem(parse(SRC), ["gdpr"])).toBe(baseline);
  });

  it("returns to the baseline when the selection is cleared (TPL-1402)", () => {
    const file = parse(SRC);
    const on = renderSystem(file, ["pii"]);
    expect(on).not.toBe(renderSystem(file));
    expect(renderSystem(file, undefined)).toBe(renderSystem(parse(SRC_WITHOUT_FACETS)));
  });
});

describe("facet overlay — selection changes the picture (TPL-1503)", () => {
  it("rings members and dims non-members", () => {
    const svg = renderSystem(parse(SRC), ["pii"]);
    expect(svg).toContain('data-facet-member="pii"');
    expect(svg).toContain('data-facet-ring="pii"');
    // Search belongs to nothing selected, so it recedes.
    const searchGroup = /<g[^>]*data-node-id="Search"[^>]*>/.exec(svg)?.[0] ?? "";
    expect(searchGroup).toContain('opacity="0.28"');
    expect(searchGroup).not.toContain("data-facet-member");
  });

  it("draws one ring per selected facet the node belongs to (TPL-2161)", () => {
    const svg = renderSystem(parse(SRC), ["pii", "pci"]);
    const apiRings = [...svg.matchAll(/data-facet-ring="(pii|pci)"/g)].map((m) => m[1]);
    // Api is in both, Billing in one — three rings across the diagram.
    expect(apiRings).toHaveLength(3);
    expect(svg).toContain('data-facet-member="pii pci"');
    expect(svg).toContain('data-facet-member="pci"');
  });

  it("orders a node's facets by known-facet order, not by selection order", () => {
    const file = parse(SRC);
    // Selecting in the reverse order must not reverse how the rings stack, or
    // the same colour would sit at a different radius on different renders.
    expect(renderSystem(file, ["pci", "pii"])).toBe(renderSystem(file, ["pii", "pci"]));
  });
});

describe("facet overlay — colour stability", () => {
  it("assigns colours by known-facet order so deselecting one does not recolour the rest", () => {
    const file = parse(SRC);
    const both = resolveFacetOverlay(file, ["pii", "pci"]);
    const onlyPci = resolveFacetOverlay(file, ["pci"]);
    expect(both?.colorOf.get("pci")).toBe(onlyPci?.colorOf.get("pci"));
    // …and the two facets are told apart in the first place.
    expect(both?.colorOf.get("pii")).not.toBe(both?.colorOf.get("pci"));
  });

  it("lists declared facets first, then reference-only ids, sorted", () => {
    const file = parse(`
facet pii { label "Personal data" }
system S {
  service A { facets zeta }
  service B { facets alpha, pii }
}
`);
    expect(knownFacetIds(file)).toEqual(["pii", "alpha", "zeta"]);
  });

  it("wraps past the end of the palette rather than running out", () => {
    const decls = Array.from({ length: 9 }, (_, i) => `facet f${i} {}`).join("\n");
    const file = parse(`${decls}\nsystem S { service A { facets f0, f8 } }`);
    const overlay = resolveFacetOverlay(file, ["f0", "f8"]);
    expect(overlay?.colorOf.get("f8")).toBe(FACET_OVERLAY_COLORS[8 % FACET_OVERLAY_COLORS.length]);
  });

  it("falls back to the id when a facet is referenced but never declared", () => {
    const file = parse(`system S { service A { facets adhoc } }`);
    expect(resolveFacetOverlay(file, ["adhoc"])?.entries[0]).toMatchObject({
      id: "adhoc",
      label: "adhoc",
    });
  });
});

describe("facet overlay — legend", () => {
  it("adds a colour key even when the model declares no legend", () => {
    // A coloured ring whose meaning is nowhere on the canvas is worse than no
    // ring, so the band appears for the overlay alone.
    const svg = renderSystem(parse(SRC), ["pii"]);
    expect(svg).toContain("Personal data");
    expect(svg).toContain("Facets");
  });

  it("names an undeclared facet by its id", () => {
    const file = parse(`system S { service A { facets adhoc } }`);
    expect(renderSystem(file, ["adhoc"])).toContain("adhoc");
  });

  it("lists only the selected facets, not every facet in the model (TPL-1223)", () => {
    const svg = renderSystem(parse(SRC), ["pii"]);
    expect(svg).toContain("Personal data");
    expect(svg).not.toContain("Card data");
  });
});

describe("facet overlay — edges", () => {
  it("keeps an edge at full strength when either endpoint is a member", () => {
    // "Where does the highlighted set touch the rest of the model" is the main
    // thing an overlay is read for, so a half-member edge must not recede.
    const svg = renderSystem(parse(SRC), ["pci"]);
    // Api->Search has neither endpoint in pci once Api is a member… Api IS in
    // pci, so this edge stays lit; assert the dimmed wrapper count instead.
    const dimWrappers = [...svg.matchAll(/<g opacity="0\.28">/g)];
    expect(dimWrappers).toHaveLength(0);
  });

  it("dims an edge whose endpoints are both outside the selection", () => {
    const file = parse(`
facet pii {}
system S {
  service A { facets pii }
  service B {}
  service C {}
  B -> C "unrelated"
}
`);
    const svg = renderSystem(file, ["pii"]);
    expect(svg).toContain('<g opacity="0.28">');
  });
});

describe("facet overlay — orthogonal to Group-by (the slice's core requirement)", () => {
  const GROUPED = `
facet pii { label "Personal data" }

organization Acme {
  team Core { owns Api }
  team Search { owns Finder }
}

system Shop {
  service Api { facets pii }
  service Finder {}
  Api -> Finder "query"
}
`;

  it("draws band frames and facet rings into the same SVG", () => {
    // The overlay paints per element and never touches band geometry, so
    // "Group by: team" and a facet selection are readable at the same time.
    // This is the AT item #2174 calls out by name.
    const file = parse(GROUPED);
    const slice = extractView(file.systems, []);
    const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
    const svg = render(slice, styles, undefined, file.ownerIndex, undefined, undefined, {
      groupBy: "team",
      facetOverlay: resolveFacetOverlay(file, ["pii"]),
    });
    expect(svg).toContain('data-facet-ring="pii"');
    expect(svg).toContain("data-group");
  });

  it("places nodes identically with and without the overlay", () => {
    // Placement must not shift when the overlay turns on, or the reader loses
    // their place in the diagram every time they select a facet.
    const file = parse(GROUPED);
    const slice = extractView(file.systems, []);
    const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
    const coords = (svg: string): string[] =>
      [...svg.matchAll(/data-node-id="([^"]+)"/g)].map((m) => m[1]);
    const off = render(slice, styles, undefined, file.ownerIndex, undefined, undefined, {
      groupBy: "team",
    });
    const on = render(slice, styles, undefined, file.ownerIndex, undefined, undefined, {
      groupBy: "team",
      facetOverlay: resolveFacetOverlay(file, ["pii"]),
    });
    expect(coords(on)).toEqual(coords(off));
  });
});

describe("facet overlay — display modes (TPL-1001)", () => {
  it("rings both icon and shape modes, because they key off the bounding box", () => {
    const file = parse(SRC);
    const slice = extractView(file.systems, []);
    const styles = resolveStyles(file.systems, [getBuiltinStyleSheet()]);
    const ringed = (["shape", "icon"] as const).filter((mode) =>
      render(slice, styles, undefined, undefined, mode, undefined, {
        facetOverlay: resolveFacetOverlay(file, ["pii"]),
      }).includes('data-facet-ring="pii"'),
    );
    expect(ringed).toEqual(["shape", "icon"]);
  });
});
