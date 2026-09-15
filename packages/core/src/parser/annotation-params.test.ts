// Annotation parameter reading, on the recovery path (#2571 review, #2707).
//
// A value the reader cannot take (`from: system`, where `system` is a keyword)
// used to be left at the cursor, so the loop read its tokens as the next key
// and reported `system` as an unsupported *key*. A diagnostic naming something
// the author never wrote sends them to the wrong fix, which is the accuracy
// TPL-1386 asks of the register.

import { describe, expect, it } from "vitest";
import { Parser } from "./parser.js";

/** Every `annotationParams` record a parsed file holds, at any depth. */
function paramsOf(src: string): Record<string, Record<string, string>>[] {
  const found: Record<string, Record<string, string>>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.annotationParams !== undefined) {
      found.push(record.annotationParams as Record<string, Record<string, string>>);
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(Parser.parse(src).value);
  return found;
}

describe("annotation parameters with an unreadable value", () => {
  it("reports no diagnostic naming a key the author never wrote", () => {
    const { diagnostics } = Parser.parse(
      `system S { service A @migration_target(from: system) {} }`,
    );

    // `system` is the value the author wrote, never a key. Reporting it as an
    // unsupported key is the false diagnostic this guards.
    expect(diagnostics.filter((d) => d.code === "annotation-param-unsupported")).toEqual([]);
  });

  it("records nothing for the unreadable key", () => {
    expect(paramsOf(`system S { service A @migration_target(from: system) {} }`)).toEqual([]);
    expect(paramsOf(`system S { service A @deprecated(until: 2026) {} }`)).toEqual([]);
  });

  it("still records a readable parameter that follows the malformed one", () => {
    // Recovery stops at the comma, so the next pair is read normally rather
    // than swallowed. Asserting a *supported* key here is the point: a parser
    // that discarded every later readable value would still satisfy a test
    // that only checked the warning on an unsupported one.
    expect(
      paramsOf(`system S { service A @deprecated(until: 2026, until: "2027-Q3") {} }`),
    ).toEqual([{ deprecated: { until: "2027-Q3" } }]);
  });

  it("still warns on a genuinely unknown key that follows the malformed one", () => {
    const { diagnostics } = Parser.parse(
      `system S { service A @deprecated(until: 2026, foo: "x") {} }`,
    );

    expect(
      diagnostics
        .filter((d) => d.code === "annotation-param-unsupported")
        .map((d) => (d.params as { key: string }).key),
    ).toEqual(["foo"]);
  });

  it("leaves the annotation itself intact", () => {
    const { value } = Parser.parse(`system S { service A @migration_target(from: system) {} }`);
    expect(value.systems[0].children[0].annotations).toEqual(["migration_target"]);
  });
});

/** The diagnostics a source produces with the given code. */
function diagnosticsOf(src: string, code: string) {
  return Parser.parse(src).diagnostics.filter((d) => d.code === code);
}

const onService = (annotations: string) => `system S { service A ${annotations} {} }`;
const onTeam = (annotations: string) =>
  `organization O { team T ${annotations} { owns A } }\nsystem S { service A {} }`;

// #2707: the lexer dropped digits, so `until: 2026-12-31` arrived as `-` `-`
// and was recorded as `until: "-"`. A value is now one string literal or bare
// word standing alone; anything else is an error and records nothing.
describe("annotation parameter values that are not one token (#2707)", () => {
  const UNREADABLE = [
    `@deprecated(until: 2026)`,
    `@deprecated(until: 2026-12-31)`,
    `@deprecated(until: 2026-Q3)`,
    `@deprecated(until: 2026abc)`,
    `@deprecated(until: )`,
    `@migration_target(from: system)`,
    `@migration_target(from: Legacy-Monolith)`,
    `@migration_target(from: Shop.Legacy)`,
  ];

  for (const annotation of UNREADABLE) {
    it(`reports ${annotation} as one unreadable-value error and records nothing`, () => {
      const src = onService(annotation);
      const errors = diagnosticsOf(src, "annotation-param-value-unreadable");
      const name = annotation.slice(1, annotation.indexOf("("));
      const key = annotation.slice(annotation.indexOf("(") + 1, annotation.indexOf(":"));

      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe("error");
      expect(errors[0].params).toEqual({ annotation: name, key });
      expect(paramsOf(src)).toEqual([]);
      // `2026-12-31` used to report `-` as an unsupported key; `Shop.Legacy`, `.`.
      expect(diagnosticsOf(src, "annotation-param-unsupported")).toEqual([]);
    });
  }

  it("records no fragment of a hyphenated date, which it used to keep as `-`", () => {
    expect(paramsOf(onService(`@deprecated(until: 2026-12-31)`))).toEqual([]);
    expect(paramsOf(onService(`@migration_target(from: Legacy-Monolith)`))).toEqual([]);
  });

  it("ranges the error over the whole value the author wrote", () => {
    const src = onService(`@deprecated(until: 2026-12-31)`);
    const [error] = diagnosticsOf(src, "annotation-param-value-unreadable");
    expect(error.loc?.start.offset).toBe(src.indexOf("2026"));
    expect(error.loc?.end.offset).toBe(src.indexOf("31"));
  });

  it("reads the quoted spelling the error points to", () => {
    for (const [annotation, expected] of [
      [`@deprecated(until: "2026-12-31")`, { deprecated: { until: "2026-12-31" } }],
      [`@migration_target(from: "Shop.Legacy")`, { migration_target: { from: "Shop.Legacy" } }],
      [`@migration_target(from: LegacyMonolith)`, { migration_target: { from: "LegacyMonolith" } }],
    ] as const) {
      const src = onService(annotation);
      expect(Parser.parse(src).diagnostics).toEqual([]);
      expect(paramsOf(src)).toEqual([expected]);
    }
  });

  it("still reads the pair after a hyphenated value", () => {
    const src = onService(`@deprecated(until: 2026-12-31, until: "2027-Q3")`);
    expect(paramsOf(src)).toEqual([{ deprecated: { until: "2027-Q3" } }]);
    expect(diagnosticsOf(src, "annotation-param-value-unreadable")).toHaveLength(1);
  });

  it("warns once on an unsupported key and does not also judge its value", () => {
    // The key has no effect whatever its value says, so the one warning about
    // the key is the whole report.
    const src = onService(`@deprecated(reason: 2026-12-31)`);
    expect(diagnosticsOf(src, "annotation-param-unsupported")).toHaveLength(1);
    expect(diagnosticsOf(src, "annotation-param-value-unreadable")).toEqual([]);
  });

  it("reports the same error on a team", () => {
    const errors = diagnosticsOf(
      onTeam(`@deprecated(until: 2026-12-31)`),
      "annotation-param-value-unreadable",
    );
    expect(errors.map((d) => d.params)).toEqual([{ annotation: "deprecated", key: "until" }]);
  });
});

// #2707: `annotationParams` holds one value per annotation and key, so a
// repeated annotation overwrote the first value and `fmt` then printed the
// second over it.
describe("repeated annotations and parameters (#2707)", () => {
  it("warns on an annotation written twice and keeps both names", () => {
    const src = onService(`@deprecated @deprecated`);
    const warnings = diagnosticsOf(src, "duplicate-annotation");
    expect(warnings.map((d) => [d.severity, d.params])).toEqual([
      ["warning", { annotation: "deprecated" }],
    ]);
    expect(Parser.parse(src).value.systems[0].children[0].annotations).toEqual([
      "deprecated",
      "deprecated",
    ]);
  });

  it("warns once per repeat", () => {
    expect(diagnosticsOf(onService(`@new @new @new`), "duplicate-annotation")).toHaveLength(2);
  });

  it("does not warn on different annotations", () => {
    expect(diagnosticsOf(onService(`@deprecated @experimental`), "duplicate-annotation")).toEqual(
      [],
    );
  });

  it("rejects a second, different value for the same parameter and keeps the first", () => {
    const src = onService(`@deprecated(until: "2026-Q3") @deprecated(until: "2027-Q3")`);
    const conflicts = diagnosticsOf(src, "annotation-param-conflict");

    expect(conflicts.map((d) => [d.severity, d.params])).toEqual([
      ["error", { annotation: "deprecated", key: "until", existing: "2026-Q3", value: "2027-Q3" }],
    ]);
    expect(paramsOf(src)).toEqual([{ deprecated: { until: "2026-Q3" } }]);
    // The repeated name is reported on its own: the two name different edits.
    expect(diagnosticsOf(src, "duplicate-annotation")).toHaveLength(1);
  });

  it("treats a repeated key inside one annotation the same way", () => {
    // The AST has the same single slot, so the same value would be lost.
    const src = onService(`@deprecated(until: "2026-Q3", until: "2027-Q3")`);
    expect(diagnosticsOf(src, "annotation-param-conflict")).toHaveLength(1);
    expect(diagnosticsOf(src, "duplicate-annotation")).toEqual([]);
    expect(paramsOf(src)).toEqual([{ deprecated: { until: "2026-Q3" } }]);
  });

  it("accepts the same value given twice", () => {
    const src = onService(`@deprecated(until: "2026-Q3") @deprecated(until: "2026-Q3")`);
    expect(diagnosticsOf(src, "annotation-param-conflict")).toEqual([]);
    expect(diagnosticsOf(src, "duplicate-annotation")).toHaveLength(1);
  });

  it("does not count a parameter that could not be read as a first value", () => {
    const src = onService(`@deprecated(until: 2026) @deprecated(until: "2027-Q3")`);
    expect(diagnosticsOf(src, "annotation-param-conflict")).toEqual([]);
    expect(paramsOf(src)).toEqual([{ deprecated: { until: "2027-Q3" } }]);
  });

  it("reports a conflict on a team", () => {
    const src = onTeam(`@deprecated(until: "2026-Q3") @deprecated(until: "2027-Q3")`);
    expect(diagnosticsOf(src, "annotation-param-conflict")).toHaveLength(1);
  });
});
