import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "./in-memory-provider";
import { MERGED_SPACE_REFERENCE_CODES, type MergedSpaceReferenceCode } from "./merged-space-codes";
import { compileProject } from "../compile/compile";

// Every diagnostic the resolver decides on the merged model only, run as a
// two-file model through the surface users reach (`compileProject`), across
// every import shape (TPL-2032, TPL-2221, TPL-2169).
//
// The code set is the resolver's own `MERGED_SPACE_REFERENCE_CODES`, and
// `FIXTURES` must have a row for each: a code added there does not typecheck
// until it has a cross-file fixture here. Each row splits a model in two:
// `entry` holds the referrer (or one half of the fact) and `variants` the
// imported file. One variant draws the code exactly once and the other not at
// all, so a merged-model check that never runs, runs twice, or reads a space a
// merge path did not fill goes red.
//
// The import shapes are a list kept here; the resolver has no closed set of
// them (see TPL-1381).

interface Fixture {
  /** The importing file's own declarations. */
  entry: string;
  /** The imported file, as the variant that draws the code once and the one that draws none. */
  variants: { draws: string; quiet: string };
  /**
   * What a named import names from the imported file to bring its half
   * across, or why the half cannot come through a named import (a named
   * import carries nodes, not `organization` / `boundary` / `facet` blocks).
   */
  named: { bare: string; path?: string } | { reason: string };
}

const NOT_NAMEABLE = "the imported half is a top-level block a named import does not carry";

/** One `usecase` reading `DB.t` and one `entity` mapped to it, in a service of their own. */
const PHYSICAL_REFS = (ref: string) =>
  `system App {\n  service Api {\n    domain G {\n      ${ref}\n    }\n  }\n}\n`;

const FIXTURES = {
  "contains-target-not-found": {
    entry: `boundary g {\n  label "G"\n  contains X\n}\n`,
    variants: {
      draws: `system S {\n  service Y {}\n}\n`,
      quiet: `system S {\n  service X {}\n}\n`,
    },
    named: { bare: "S", path: "S.X" },
  },
  "owns-target-not-found": {
    // A model with no node at all is the org-only file, which `owns` does not
    // judge, so the entry declares one of its own.
    entry: `system Home {\n  service H {}\n}\norganization O {\n  team T { owns X }\n}\n`,
    variants: {
      draws: `system S {\n  service Y {}\n}\n`,
      quiet: `system S {\n  service X {}\n}\n`,
    },
    named: { bare: "S", path: "S.X" },
  },
  "owns-target-ambiguous": {
    // A service at depth 2 and a domain at depth 3 answer the bare id.
    entry: `system Shop {\n  service Payment {}\n}\norganization O {\n  team T { owns Payment }\n}\n`,
    variants: {
      draws: `system Other {\n  service Checkout {\n    domain Payment {}\n  }\n}\n`,
      quiet: `system Other {\n  service Checkout {\n    domain Cart {}\n  }\n}\n`,
    },
    named: { bare: "Other", path: "Other.Checkout" },
  },
  "contains-target-ambiguous": {
    entry: `system Shop {\n  service Payment {}\n}\nboundary g {\n  label "G"\n  contains Payment\n}\n`,
    variants: {
      draws: `system Other {\n  service Checkout {\n    domain Payment {}\n  }\n}\n`,
      quiet: `system Other {\n  service Checkout {\n    domain Cart {}\n  }\n}\n`,
    },
    named: { bare: "Other", path: "Other.Checkout" },
  },
  "realizes-target-ambiguous": {
    // A service and a database, both one level under a system.
    entry:
      `system Shop {\n  service Api {}\n}\n` +
      `deploy prod {\n  oci unit {\n    runtime "Docker"\n    realizes Api\n  }\n}\n`,
    variants: {
      draws: `system Infra {\n  database Api {}\n}\n`,
      quiet: `system Infra {\n  database Store {}\n}\n`,
    },
    named: { bare: "Infra" },
  },
  "duplicate-owner-assignment": {
    // Ownership is recorded by path whether or not the target exists, so the
    // two claims are what is split across the files.
    entry: `system S {\n  service X {}\n}\norganization O {\n  team A { owns X }\n}\n`,
    variants: {
      draws: `organization P {\n  team B { owns X }\n}\n`,
      quiet: `organization P {\n  team B { owns S }\n}\n`,
    },
    named: { reason: NOT_NAMEABLE },
  },
  "unresolved-resource-ref": {
    entry: PHYSICAL_REFS(`usecase U { resource DB.t { operations read } }`),
    variants: {
      draws: `system Infra {\n  database DB {\n    table other\n  }\n}\n`,
      quiet: `system Infra {\n  database DB {\n    table t\n  }\n}\n`,
    },
    named: { bare: "Infra", path: "Infra.DB" },
  },
  "unresolved-table-ref": {
    entry: PHYSICAL_REFS(`entity E { table DB.t }`),
    variants: {
      draws: `system Infra {\n  database DB {\n    table other\n  }\n}\n`,
      quiet: `system Infra {\n  database DB {\n    table t\n  }\n}\n`,
    },
    named: { bare: "Infra", path: "Infra.DB" },
  },
  "resource-target-ambiguous": {
    // A client's storage and an infra block answer the same `WebApp.ApiKey`
    // only once the imported half adds the infra block (#3794).
    entry:
      `client WebApp [web] {\n  resource sessionStorage ApiKey "k"\n}\n` +
      PHYSICAL_REFS(`usecase U { resource WebApp.ApiKey { operations read } }`),
    variants: {
      draws: `system Infra {\n  storage WebApp {\n    bucket ApiKey\n  }\n}\n`,
      quiet: `system Infra {\n  storage Other {\n    bucket ApiKey\n  }\n}\n`,
    },
    named: { bare: "Infra", path: "Infra.WebApp" },
  },
  "duplicate-facet-id": {
    entry: `facet pii {\n  label "PII"\n}\n`,
    variants: {
      draws: `facet pii {\n  label "Personal data"\n}\n`,
      quiet: `facet pci {\n  label "PCI"\n}\n`,
    },
    named: { reason: NOT_NAMEABLE },
  },
  "duplicate-boundary-assignment": {
    // Scoped boundaries on a reopened system travel with it (#2246).
    entry: `system Shop {\n  boundary one {\n    label "One"\n    contains Ledger\n  }\n  service Ledger {}\n}\n`,
    variants: {
      draws: `system Shop {\n  boundary two {\n    label "Two"\n    contains Ledger\n  }\n}\n`,
      quiet: `system Shop {\n  boundary two {\n    label "Two"\n    contains Cart\n  }\n  service Cart {}\n}\n`,
    },
    named: { bare: "Shop" },
  },
  "duplicate-boundary-id": {
    entry: `system Shop {\n  boundary core {\n    label "One"\n    contains Ledger\n  }\n  service Ledger {}\n}\n`,
    variants: {
      draws: `system Shop {\n  boundary core {\n    label "Two"\n    contains Cart\n  }\n  service Cart {}\n}\n`,
      quiet: `system Shop {\n  boundary other {\n    label "Two"\n    contains Cart\n  }\n  service Cart {}\n}\n`,
    },
    named: { bare: "Shop" },
  },
  "node-id-multiple-locations": {
    entry: `system Legacy {\n  service Search {}\n}\n`,
    variants: {
      draws: `system Next {\n  service Search {}\n}\n`,
      quiet: `system Next {\n  service Find {}\n}\n`,
    },
    named: { bare: "Next", path: "Next.Search" },
  },
} satisfies Record<MergedSpaceReferenceCode, Fixture>;

type Shape = (fixture: Fixture) => { files: Record<string, string>; imported: string } | null;

/**
 * The ways the imported half reaches the entry. `imported` is the path the
 * variant is written to. A named shape returns null for a fixture whose half
 * a named import cannot carry.
 */
const SHAPES: Record<string, Shape> = {
  "whole-file import": (f) => ({
    files: { "index.krs": `import "b.krs"\n${f.entry}` },
    imported: "b.krs",
  }),
  "directory import": (f) => ({
    files: { "index.krs": `import "lib/"\n${f.entry}` },
    imported: "lib/b.krs",
  }),
  "named import, bare id": (f) =>
    "bare" in f.named
      ? {
          files: { "index.krs": `import { ${f.named.bare} } from "b.krs"\n${f.entry}` },
          imported: "b.krs",
        }
      : null,
  "named import, path": (f) =>
    "bare" in f.named && f.named.path
      ? {
          files: { "index.krs": `import { ${f.named.path} } from "b.krs"\n${f.entry}` },
          imported: "b.krs",
        }
      : null,
  // The relation itself sits in an imported file and its target in another
  // (TPL-2169 item 3): the entry holds nothing but the two imports.
  "both halves imported from sibling files": (f) => ({
    files: { "index.krs": `import "a.krs"\nimport "b.krs"\n`, "a.krs": f.entry },
    imported: "b.krs",
  }),
};

async function count(
  code: MergedSpaceReferenceCode,
  files: Record<string, string>,
): Promise<number> {
  const fs = new InMemoryFileSystemProvider();
  for (const [path, content] of Object.entries(files)) await fs.writeFile(`/p/${path}`, content);
  const result = await compileProject("/p/index.krs", fs);
  return result.diagnostics.filter((d) => d.code === code).length;
}

const ROWS = Object.entries(FIXTURES).flatMap(([code, fixture]) =>
  Object.entries(SHAPES).flatMap(([shapeName, shape]) => {
    const built = shape(fixture);
    return built
      ? [{ name: `${code} / ${shapeName}`, code: code as MergedSpaceReferenceCode, fixture, built }]
      : [];
  }),
);

describe("every merged-model diagnostic is decided once across files (TPL-2032, TPL-2221)", () => {
  it("has a fixture for every code the resolver decides on the merged model", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...MERGED_SPACE_REFERENCE_CODES].sort());
  });

  // A fixture whose imported file draws the code on its own proves nothing
  // about the merge.
  it.each(Object.entries(FIXTURES))(
    "%s: neither variant of the imported file draws it on its own",
    async (code, f) => {
      for (const variant of [f.variants.draws, f.variants.quiet]) {
        expect(await count(code as MergedSpaceReferenceCode, { "index.krs": variant })).toBe(0);
      }
    },
  );

  it.each(ROWS)("$name", async ({ code, fixture, built }) => {
    const draws = await count(code, { ...built.files, [built.imported]: fixture.variants.draws });
    const quiet = await count(code, { ...built.files, [built.imported]: fixture.variants.quiet });
    expect({ draws, quiet }).toEqual({ draws: 1, quiet: 0 });
  });
});
