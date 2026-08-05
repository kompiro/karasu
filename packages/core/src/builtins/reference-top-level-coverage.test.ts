import { describe, it, expect } from "vitest";
import { getReference } from "./reference.js";
import { SYNTAX_SECTIONS } from "./reference-data.js";
import { createEmptyKrsFile } from "../types/ast.js";
import type { KrsFile } from "../types/ast.js";

// Discoverability guard for the Reference surface (#2316, TPL-2316).
//
// `boundary` and `facet` were declarable, spec'd, shipped — and absent from
// `getReference()`, so neither was reachable from the Reference panel. Worse,
// the *element-side* half of `facet` (the `facets` property) was listed on all
// 14 node kinds, so a reader could find the property and had no way, inside the
// Reference, to learn what it pointed at.
//
// A construct is either reachable from the Reference or it does not exist as
// far as a user browsing the panel is concerned. Rather than pin down the two
// that were missing, this test derives the expected coverage from `KrsFile`
// itself, the same way `formatter-top-level-coverage.test.ts` derives the
// formatter's: every array-valued key must declare *how* it is reachable, and
// the claim is then verified against `getReference()`.
//
// Adding a top-level construct to `KrsFile` without wiring it into the
// Reference fails to compile here (the `satisfies` below), which is the point:
// the omission has to be a decision someone wrote down, not a silence.

/** Array-valued keys of `KrsFile` — the set `SURFACES` must cover exactly. */
type ArrayKeys<T> = {
  [K in keyof T]-?: T[K] extends readonly unknown[] ? K : never;
}[keyof T];

/**
 * How each top-level construct is reachable from `getReference()`.
 *
 * - `nodeKind` / `deployUnitKind` / `orgKind` — a row in that catalog, keyed by
 *   the kind name.
 * - `groupingConstruct` — a row in the grouping / membership catalog (#2316).
 * - `syntaxSnippet` — no catalog row; a literal `.krs` snippet in the Syntax
 *   tab must mention the keyword. Used for constructs that are directives
 *   rather than declarations (`import`) or that have no per-entry data to
 *   tabulate (`legend`).
 */
type Surface =
  | { via: "nodeKind"; kind: string }
  | { via: "deployUnitKind"; kind: string }
  | { via: "orgKind"; kind: string }
  | { via: "groupingConstruct"; construct: string }
  | { via: "syntaxSnippet"; view: "system" | "deploy" | "org"; keyword: string };

const SURFACES = {
  styleImports: { via: "syntaxSnippet", view: "system", keyword: "@import" },
  nodeImports: { via: "syntaxSnippet", view: "system", keyword: "import {" },
  systems: { via: "nodeKind", kind: "system" },
  services: { via: "nodeKind", kind: "service" },
  clients: { via: "nodeKind", kind: "client" },
  domains: { via: "nodeKind", kind: "domain" },
  databases: { via: "nodeKind", kind: "database" },
  queues: { via: "nodeKind", kind: "queue" },
  storages: { via: "nodeKind", kind: "storage" },
  deploys: { via: "deployUnitKind", kind: "oci" },
  organizations: { via: "orgKind", kind: "organization" },
  boundaries: { via: "groupingConstruct", construct: "boundary" },
  facets: { via: "groupingConstruct", construct: "facet" },
  legends: { via: "syntaxSnippet", view: "system", keyword: "legend" },
} satisfies Record<ArrayKeys<KrsFile>, Surface>;

/** Array-valued keys of a fresh `KrsFile` — the set the Reference must cover. */
function topLevelArrayKeys(): string[] {
  const empty = createEmptyKrsFile() as unknown as Record<string, unknown>;
  return Object.keys(empty).filter((key) => Array.isArray(empty[key]));
}

const ref = getReference("en");

function isReachable(surface: Surface): boolean {
  switch (surface.via) {
    case "nodeKind":
      return ref.nodeKinds.some((k) => k.kind === surface.kind);
    case "deployUnitKind":
      return ref.deployUnitKinds.some((k) => k.kind === surface.kind);
    case "orgKind":
      return ref.orgKinds.some((k) => k.kind === surface.kind);
    case "groupingConstruct":
      return ref.groupingConstructs.some((g) => g.construct === surface.construct);
    case "syntaxSnippet":
      return SYNTAX_SECTIONS[surface.view].some(
        (s) => "code" in s && s.code.includes(surface.keyword),
      );
  }
}

describe("every top-level construct is reachable from getReference() (TPL-2316)", () => {
  it("has a declared surface for every array-valued KrsFile key", () => {
    // Catches a key added to `KrsFile` at runtime that the `satisfies` above
    // cannot see (e.g. a key whose type is a union that erases to unknown[]).
    const uncovered = topLevelArrayKeys().filter((key) => !(key in SURFACES));
    expect(uncovered).toEqual([]);
  });

  it.each(Object.entries(SURFACES))("`%s` is reachable", (_key, surface) => {
    expect(isReachable(surface as Surface)).toBe(true);
  });
});

describe("experimental notation is listed AND flagged (ADR-2316)", () => {
  // The decision is not "list everything" — it is "list it, and say it is
  // experimental". A row that lost its flag would advertise a stability
  // promise the promotion gate has not made.
  it("marks boundary and facet experimental", () => {
    const experimental = ref.groupingConstructs
      .filter((g) => g.experimental)
      .map((g) => g.construct)
      .sort();
    expect(experimental).toEqual(["boundary", "facet"]);
  });

  it("marks the Syntax-tab sections that render experimental notation", () => {
    const flagged = SYNTAX_SECTIONS.system.filter((s) => s.experimental).map((s) => s.heading);
    expect(flagged).toContain("Grouping & Membership");
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("does not flag sections whose notation is v1.0-stable", () => {
    const stable = SYNTAX_SECTIONS.system.filter((s) => !s.experimental).map((s) => s.heading);
    expect(stable).toContain("Node Kinds");
    expect(stable).toContain("Edge Syntax");
  });
});

describe("the facets property and the facet declaration are both findable", () => {
  // The asymmetry #2316 was actually about: `facets` was advertised on every
  // node kind while the thing it references was nowhere in the payload, so the
  // Reference could show you the property and not what it pointed at.
  it("every kind that advertises `facets` has a `facet` construct to point at", () => {
    const advertisers = ref.nodeKinds.filter((k) => k.properties.includes("facets"));
    expect(advertisers.length).toBeGreaterThan(0);
    expect(ref.groupingConstructs.some((g) => g.construct === "facet")).toBe(true);
  });

  it("the facet row names the element-side property, not just the block", () => {
    const facet = ref.groupingConstructs.find((g) => g.construct === "facet");
    expect(facet?.membership).toContain("facets");
  });

  it("the boundary row names its by-reference member list", () => {
    const boundary = ref.groupingConstructs.find((g) => g.construct === "boundary");
    expect(boundary?.membership).toContain("contains");
    expect(boundary?.properties).toContain("contains");
  });
});
