import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  addKrsSource,
  addStyleSource,
  censusOver,
  emptyCensus,
  formatCensus,
  sourceFilesUnder,
} from "./vocabulary.ts";

const repoRoot = resolve(__dirname, "../..");

function censusOfKrs(source: string) {
  const census = emptyCensus();
  addKrsSource(census, "fixture.krs", source);
  return census;
}

function censusOfStyle(source: string) {
  const census = emptyCensus();
  addStyleSource(census, "fixture.krs.style", source);
  return census;
}

describe("tag register", () => {
  it("splits builtin from non-builtin by name", () => {
    const census = censusOfKrs(`
system Shop {
  service Gateway [external] {
    label "Gateway"
  }
  database Cards [pci] {
    label "Cards"
  }
}
`);
    expect(census.tags.occurrences).toBe(2);
    expect(census.tags.builtin).toEqual({ external: 1 });
    expect(census.tags.nonBuiltin).toEqual({ pci: 1 });
  });

  it("records where each non-builtin name was written, once per source", () => {
    const census = emptyCensus();
    addKrsSource(census, "a.krs", `system A { service X [pci] { label "X" } }`);
    addKrsSource(census, "a.krs", `system B { service Y [pci] { label "Y" } }`);
    addKrsSource(census, "b.krs", `system C { service Z [pci] { label "Z" } }`);
    expect(census.tags.nonBuiltinSites).toEqual({ pci: ["a.krs", "b.krs"] });
    expect(census.tags.nonBuiltin).toEqual({ pci: 3 });
  });

  it("counts every occurrence of a repeated non-builtin name", () => {
    const census = censusOfKrs(`
system Shop {
  service A [pci] { label "A" }
  service B [pci] { label "B" }
}
`);
    expect(census.tags.nonBuiltin).toEqual({ pci: 2 });
  });

  /**
   * The load-bearing guard. The denominator comes from this script's own walk
   * and the numerator from the shipped `tag-not-builtin` diagnostic, so a node
   * collection reached by only one of the two shows up here as a non-builtin
   * tag that silently landed in the `builtin` tally — the census would then
   * under-report exactly the thing the v2.0 closure needs counted.
   */
  it("classifies non-builtin tags in every place the diagnostic looks", () => {
    const census = censusOfKrs(`
client Kiosk [zzznotatag] { label "Kiosk" }
service Standalone [zzznotatag] { label "Standalone" }
database Store [zzznotatag] { label "Store" }
queue Events [zzznotatag] { label "Events" }
storage Blobs [zzznotatag] { label "Blobs" }

system Shop [zzznotatag] {
  service Nested [zzznotatag] {
    label "Nested"
    usecase Buy [zzznotatag] { label "Buy" }
  }
  service Other { label "Other" }
  Nested -> Other "calls" [zzznotatag]
}
`);
    expect(census.tags.builtin).toEqual({});
    expect(census.tags.nonBuiltin).toEqual({ zzznotatag: 9 });
    expect(census.tags.occurrences).toBe(9);
  });
});

describe("annotation register", () => {
  it("splits builtin from non-builtin, including on teams", () => {
    const census = censusOfKrs(`
organization Acme {
  team Platform @zzzcanary {
    label "Platform"
  }
}

system Shop {
  service Search @new { label "Search" }
  service Legacy @zzzcanary { label "Legacy" }
}
`);
    expect(census.annotations.builtin).toEqual({ new: 1 });
    expect(census.annotations.nonBuiltin).toEqual({ zzzcanary: 2 });
    expect(census.annotations.occurrences).toBe(3);
  });
});

describe("facet register", () => {
  it("counts declarations and element-side memberships", () => {
    const census = censusOfKrs(`
facet pci { label "Cardholder data" }
facet pii { label "Personal data" }

system Shop {
  service Checkout { facets pci, pii }
  database Ledger { facets pci }
  service Catalogue { label "Catalogue" }
}
`);
    expect(census.facets.declared).toEqual({ pci: 1, pii: 1 });
    expect(census.facets.memberships).toEqual({ pci: 2, pii: 1 });
    expect(census.facets.nodesWithFacets).toBe(2);
  });

  /**
   * Membership is read at the declaration site, not through `facetIndex`,
   * which is keyed by bare node id and collapses same-named nodes in different
   * scopes into one entry (TPL-1352 — the bug #2177 hit building the overview).
   */
  it("keeps same-named nodes in different scopes apart", () => {
    const census = censusOfKrs(`
facet pci { label "Cardholder data" }

system Left {
  service Api { facets pci }
}

system Right {
  service Api { facets pci }
}
`);
    expect(census.facets.memberships).toEqual({ pci: 2 });
    expect(census.facets.nodesWithFacets).toBe(2);
  });

  it("does not count a facet reference as a tag", () => {
    const census = censusOfKrs(`
facet pci { label "Cardholder data" }
system Shop {
  service Checkout { facets pci }
}
`);
    expect(census.tags.occurrences).toBe(0);
  });
});

describe("style selectors", () => {
  it("splits tag and annotation selectors, and counts facet selectors", () => {
    const census = censusOfStyle(`
service[external] { background-color: #f3f4f6; }
[pci] { border-color: #f59e0b; }
@deprecated { opacity: 0.7; }
@zzzcanary { opacity: 0.5; }
[facets=pci] { border-width: 2px; }
[facets=pci][facets=pii] { border-style: dashed; }
`);
    expect(census.styleSelectors.tagBuiltin).toEqual({ external: 1 });
    expect(census.styleSelectors.tagNonBuiltin).toEqual({ pci: 1 });
    expect(census.styleSelectors.annotationBuiltin).toEqual({ deprecated: 1 });
    expect(census.styleSelectors.annotationNonBuiltin).toEqual({ zzzcanary: 1 });
    expect(census.styleSelectors.facet).toEqual({ pci: 2, pii: 1 });
  });

  it("keeps a tag and an annotation of the same name apart in the site index", () => {
    const census = censusOfStyle(`
[zzzsame] { opacity: 0.9; }
@zzzsame { opacity: 0.8; }
`);
    expect(census.styleSelectors.nonBuiltinSites).toEqual({
      zzzsame: ["fixture.krs.style"],
      "@zzzsame": ["fixture.krs.style"],
    });
  });
});

describe("source selection", () => {
  it("excludes a source the parser rejects rather than counting it partially", () => {
    const census = censusOfKrs("service {");
    expect(census.scanned.unparseable).toEqual(["fixture.krs"]);
    expect(census.tags.occurrences).toBe(0);
  });

  it("finds .krs and .krs.style below a root", () => {
    const files = sourceFilesUnder(repoRoot, "examples/en/feature-samples");
    expect(files).toContain("examples/en/feature-samples/tag-facet-registers.krs");
    expect(files).toContain("examples/en/feature-samples/tag-facet-registers.krs.style");
  });

  it("returns nothing for a root that does not exist, so the CLI can refuse it", () => {
    expect(sourceFilesUnder(repoRoot, "exmaples")).toEqual([]);
    expect(sourceFilesUnder(repoRoot, "/etc")).toEqual([]);
  });

  // `.claude/worktrees/**` holds full copies of this repo; a `.` root that
  // descended into them would count every example once per in-flight branch.
  it("does not descend into dot-directories", () => {
    expect(sourceFilesUnder(repoRoot, ".").some((f) => f.startsWith("./."))).toBe(false);
  });

  it("counts a file once when roots overlap", () => {
    const both = censusOver(repoRoot, ["examples", "examples/en"]);
    const one = censusOver(repoRoot, ["examples"]);
    expect(both.scanned.krsFiles).toBe(one.scanned.krsFiles);
    expect(both.tags.occurrences).toBe(one.tags.occurrences);
  });
});

describe("documentation corpus", () => {
  // The PR's headline conclusion — "every non-builtin occurrence is in a doc
  // fence, none in examples/" — comes entirely from this path, so it needs its
  // own floor rather than riding on the `.krs` one.
  const census = censusOver(repoRoot, ["examples"], ["docs/spec", "docs/guide", "docs/acceptance"]);

  it("parses a non-trivial number of fences", () => {
    expect(census.scanned.docFences).toBeGreaterThan(100);
  });

  it("keeps the walk and the diagnostics in agreement across the whole corpus", () => {
    expect(census.scanned.divergences).toEqual([]);
  });

  it("sees the deprecation demos the spec teaches on purpose", () => {
    // `docs/spec/style.md` writes `[pci]` as the "Before" of the migration,
    // and `docs/spec/tags-annotations.md` writes `@team_alpha` next to a
    // comment saying it warns. Both are the census working, not drift.
    expect(census.tags.nonBuiltin.pci).toBeGreaterThan(0);
    expect(census.annotations.nonBuiltin.team_alpha).toBeGreaterThan(0);
  });

  it("skips fences that declare themselves fragment or invalid", () => {
    const withMarkers = emptyCensus();
    // A bare marker check would have to know the marker names; this asserts
    // the behaviour instead, so it survives a marker being added upstream.
    addKrsSource(withMarkers, "fence", `system S { service A [zzzskipme] { label "A" } }`);
    expect(withMarkers.tags.nonBuiltin).toEqual({ zzzskipme: 1 });
    expect(census.tags.nonBuiltin.zzzskipme).toBeUndefined();
  });
});

describe("census over the shipped examples", () => {
  // Floored the same way `measureKrsFenceCoverage` is: a census that reports
  // "no non-builtin vocabulary" because a root moved and it read nothing is
  // worse than no census at all.
  const census = censusOver(repoRoot, ["examples"]);

  it("scans a non-trivial number of files", () => {
    expect(census.scanned.krsFiles).toBeGreaterThan(50);
    expect(census.scanned.styleFiles).toBeGreaterThan(0);
  });

  it("parses every shipped source", () => {
    expect(census.scanned.unparseable).toEqual([]);
  });

  it("sees the facet feature-sample's declarations", () => {
    expect(census.facets.declared.pci).toBeGreaterThan(0);
    expect(census.facets.memberships.pci).toBeGreaterThan(0);
  });

  it("renders a summary naming every register", () => {
    const summary = formatCensus(census);
    expect(summary).toContain("tags:");
    expect(summary).toContain("annotations:");
    expect(summary).toContain("facets:");
    expect(summary).toContain("style selectors:");
  });
});
