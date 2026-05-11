import { describe, it, expect } from "vitest";
import { REFERENCE_DATA } from "./reference-data.js";

// `REFERENCE_DATA` is the single source of truth behind `getReference()`.
// These tests guard the invariant the adapter relies on: every entry
// carries a non-empty description in *both* locales (the failure mode
// TPL-20260511-02 calls out — one locale silently `undefined`).

const LOCALES = ["en", "ja"] as const;

const categories = {
  nodeKinds: REFERENCE_DATA.nodeKinds,
  deployUnitKinds: REFERENCE_DATA.deployUnitKinds,
  orgKinds: REFERENCE_DATA.orgKinds,
  tags: REFERENCE_DATA.tags,
  annotations: REFERENCE_DATA.annotations,
  styleProperties: REFERENCE_DATA.styleProperties,
  shapes: REFERENCE_DATA.shapes,
};

describe("REFERENCE_DATA", () => {
  for (const [name, entries] of Object.entries(categories)) {
    it(`${name}: is non-empty`, () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    it(`${name}: every entry has a non-empty en + ja description`, () => {
      for (const entry of entries) {
        for (const locale of LOCALES) {
          expect(typeof entry.description[locale]).toBe("string");
          expect(entry.description[locale].length).toBeGreaterThan(0);
        }
      }
    });
  }

  it("annotations: every default badge label has a non-empty en + ja string", () => {
    for (const a of REFERENCE_DATA.annotations) {
      for (const locale of LOCALES) {
        expect(typeof a.defaultBadge.label[locale]).toBe("string");
        expect(a.defaultBadge.label[locale].length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate identifiers within a category", () => {
    const ids = (xs: { kind?: string; name?: string }[]) => xs.map((x) => x.kind ?? x.name);
    for (const entries of Object.values(categories)) {
      const list = ids(entries);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
