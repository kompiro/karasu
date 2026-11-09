import { describe, it, expect } from "vitest";
import { createEmptyKrsFile, type KrsFile } from "./ast.js";

// Every field of `KrsFile` says what it holds, so a new derived index cannot
// slip in as a 1:1 map beside the fact it was derived from (TPL-2161).
//
// A declaration read into an index keeps every value it declared; picking one
// (a primary boundary, a winning path) is a view's job, done by one pure
// function where the view needs it. A 1:1 map stored on the model instead
// discards the others for every consumer, which is how #2161 lost all but the
// first boundary a node was declared in.
//
// `FIELDS` must name every key of `KrsFile` (the `satisfies` clause fails
// typecheck on a new field until it is classified), and the type below checks
// the classification against the field's type: a map whose values are not
// themselves a collection can only be listed as `single`, with the reason it
// may keep one value. Whether that reason holds stays a review question.

type Field =
  /** A list of declarations as written. */
  | "declarations"
  /** An index that keeps every value declared for a key. */
  | "multi"
  /** An index that keeps one value per key, and why that loses nothing. */
  | { single: string };

const FIELDS = {
  styleImports: "declarations",
  nodeImports: "declarations",
  systems: "declarations",
  services: "declarations",
  clients: "declarations",
  domains: "declarations",
  databases: "declarations",
  queues: "declarations",
  storages: "declarations",
  deploys: "declarations",
  organizations: "declarations",
  boundaries: "declarations",
  facets: "declarations",
  legends: "declarations",
  ownerIndex: {
    single:
      "A node's primary owner. Co-ownership is a tolerated fact reported as " +
      "duplicate-owner-assignment (ADR-1566); every owns line stays on the team blocks.",
  },
  boundaryMembership: "multi",
  scopedBoundaryMembership: "multi",
  facetIndex: "multi",
  facetIndexByPath: "multi",
  nodePathIndex: {
    single:
      "The winning path of a bare id. Every path stays in nodePathRanking, whose head " +
      "this is (ADR-2550).",
  },
  nodePathRanking: "multi",
  nodeFileIndex: {
    single:
      "The defining file of the nodePathRanking winner. Every node's own file stays in " +
      "nodeFileIndexByPath (#2934).",
  },
  nodeFileIndexByPath: {
    single: "Keyed by full path, which names one node, so there is one defining file.",
  },
} as const satisfies Record<keyof KrsFile, Field>;

/** Fields typed as a map whose value is not an array, set or map. */
type ScalarMapFields = {
  [K in keyof KrsFile]: KrsFile[K] extends Map<unknown, infer V>
    ? V extends readonly unknown[] | Set<unknown> | Map<unknown, unknown>
      ? never
      : K
    : never;
}[keyof KrsFile];

/** Fields listed as `single`. */
type SingleFields = {
  [K in keyof typeof FIELDS]: (typeof FIELDS)[K] extends { single: string } ? K : never;
}[keyof typeof FIELDS];

// Compiles only while every scalar-valued map is listed as `single`.
const scalarMapsAreSingle: ScalarMapFields extends SingleFields ? true : never = true;

describe("KrsFile fields are classified (TPL-2161)", () => {
  it("lists exactly the fields an empty KrsFile has", () => {
    expect(Object.keys(FIELDS).sort()).toEqual(Object.keys(createEmptyKrsFile()).sort());
    expect(scalarMapsAreSingle).toBe(true);
  });

  it("gives every single-valued index a reason", () => {
    const unexplained = Object.entries(FIELDS)
      .filter(([, field]) => typeof field === "object" && field.single.trim().length < 20)
      .map(([name]) => name);
    expect(unexplained).toEqual([]);
  });
});
