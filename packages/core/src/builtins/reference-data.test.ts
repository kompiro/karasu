import { describe, it, expect } from "vitest";
import { REFERENCE_DATA } from "./reference-data.js";
import { StyleParser, computeSpecificity } from "../parser/style-parser.js";

const REFERENCE_VIEWS = ["system", "deploy", "org"] as const;

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

describe("REFERENCE_DATA.syntaxSnippets / styleSelectorExamples", () => {
  for (const view of REFERENCE_VIEWS) {
    it(`${view}: has snippet sections, each a code block or a kind table`, () => {
      const sections = REFERENCE_DATA.syntaxSnippets[view];
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        // Exactly one of `code` / `kindTable` — the app's render branch keys on it.
        const hasCode = typeof s.code === "string" && s.code.length > 0;
        const isTable = s.kindTable === true;
        expect(hasCode !== isTable).toBe(true);
        expect(s.heading.length).toBeGreaterThan(0);
      }
    });

    it(`${view}: has a non-empty selector-example block`, () => {
      expect(REFERENCE_DATA.styleSelectorExamples[view].length).toBeGreaterThan(0);
    });
  }
});

describe("REFERENCE_DATA.selectorSpecificity", () => {
  it("every row's score matches what the style parser computes for its example", () => {
    // Parse each example as a real `.krs.style` rule and compare against the
    // parser's own specificity — locks this data to `computeSpecificity` so the
    // app panel and `docs/spec/style.md` can't drift from the implementation.
    const computed = REFERENCE_DATA.selectorSpecificity.map((row) => {
      const rule = StyleParser.parse(`${row.example} { color: #000000; }`).value.rules[0];
      return {
        example: row.example,
        expected: row.score,
        actual: computeSpecificity(rule.selector),
      };
    });
    for (const c of computed) {
      expect({ example: c.example, score: c.actual }).toEqual({
        example: c.example,
        score: c.expected,
      });
    }
  });

  it("every row has a non-empty en + ja selector label and a unique example", () => {
    const examples = REFERENCE_DATA.selectorSpecificity.map((s) => s.example);
    expect(new Set(examples).size).toBe(examples.length);
    for (const row of REFERENCE_DATA.selectorSpecificity) {
      for (const locale of LOCALES) {
        expect(row.selector[locale].length).toBeGreaterThan(0);
      }
    }
  });
});
