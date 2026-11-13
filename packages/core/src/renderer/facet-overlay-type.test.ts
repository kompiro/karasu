import { describe, it, expectTypeOf } from "vitest";
import type { FacetOverlay } from "./facet-overlay.js";

/**
 * An active facet overlay always selects at least one facet: "nothing selected"
 * is `undefined`, never an overlay with no legend rows (TPL-2174). This file is
 * the guard for that, and it is checked by `tsc --noEmit` (core's `typecheck`,
 * which CI runs), not by the test runner: each `@ts-expect-error` below turns
 * into an "unused directive" error the moment the type allows the write again,
 * for example if `entries` goes back to a plain array.
 */

type Entry = FacetOverlay["entries"][number];

const rest = { membership: new Map(), membershipByPath: new Map(), colorOf: new Map() };
const entry: Entry = { id: "pii", label: "PII", color: "#14B8A6" };

describe("FacetOverlay cannot be active and empty (TPL-2174)", () => {
  it("rejects an overlay with no entries", () => {
    // @ts-expect-error an active overlay has at least one entry
    const empty: FacetOverlay = { entries: [], ...rest };
    expectTypeOf<[]>().not.toExtend<FacetOverlay["entries"]>();
    void empty;
  });

  it("rejects entries that were not narrowed to non-empty", () => {
    const unchecked: Entry[] = [entry];
    // @ts-expect-error a plain array may be empty, so it has to be narrowed first
    const overlay: FacetOverlay = { entries: unchecked, ...rest };
    void overlay;
    expectTypeOf<Entry[]>().not.toExtend<FacetOverlay["entries"]>();
  });

  it("rejects emptying an overlay after it is built", () => {
    const overlay: FacetOverlay = { entries: [entry], ...rest };
    // @ts-expect-error the entries are read-only, so they cannot be popped empty
    overlay.entries.pop();
    // Read-only: the entries do not pass as a mutable array.
    expectTypeOf<FacetOverlay["entries"]>().not.toExtend<Entry[]>();
  });

  it("accepts an overlay with one entry", () => {
    expectTypeOf<[Entry]>().toExtend<FacetOverlay["entries"]>();
  });
});
