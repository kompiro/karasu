// Annotation parameter reading, on the recovery path (#2571 review).
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

  it("still reads a following parameter, and still warns on a real unknown key", () => {
    // Recovery stops at the comma, so the pair after a malformed one is read
    // normally rather than swallowed.
    const src = `system S { service A @deprecated(until: 2026, foo: "x") {} }`;
    const { diagnostics } = Parser.parse(src);

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
