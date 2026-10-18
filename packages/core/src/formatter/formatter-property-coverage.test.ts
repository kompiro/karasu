import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";
import type { KrsNode } from "../types/ast.js";

// Exhaustiveness guard for the properties the formatter prints on a node (#3101).
//
// The node-level twin of `formatter-top-level-coverage.test.ts` (ADR-2076).
// `Printer.renderProperties` lists node properties by hand, and a property it
// leaves out is parsed and then silently discarded: `karasu fmt` and
// format-on-save destroy source the parser accepted. That happened to
// `handles` (#2549) and to a client's `resource` / `capability` lines (#3101).
//
// Rather than pin down only those, the expected key set is derived from the
// `properties` type of every `KrsNode` kind: each key must have a fixture
// here, and each fixture must survive a format round trip. Adding a property
// to a node type without wiring it into the formatter fails to compile here.
//
// See TPL-1101 (round-trip guarantee).

/** Every key any `KrsNode` kind carries in `properties` (distributes over the union). */
type PropertyKeys<N> = N extends { properties: infer P } ? keyof P : never;

/**
 * One `.krs` sample per property key. Each sample must populate the keyed
 * property on some node when parsed, which is asserted below, so a fixture
 * that silently stopped exercising its property is caught too.
 *
 * `satisfies` (not a type annotation) keeps the check exact: a missing key or
 * a key no node type has fails to compile.
 */
const FIXTURES = {
  description: `system S {\n  service A {\n    description "What A does"\n  }\n}\n`,
  links: `system S {\n  service A {\n    link "https://example.com/a" "Runbook"\n    link "https://example.com/b"\n  }\n}\n`,
  role: `system S {\n  user U [human] {\n    role "Operator"\n  }\n}\n`,
  handles: `system S {\n  service A {\n    domain D {}\n  }\n  service B {\n    handles D\n  }\n  B -> A "calls"\n}\n`,
  delivers: `system S {\n  client C [web] {}\n  service Web {\n    delivers C\n  }\n}\n`,
  operations: `system S {\n  service A {\n    domain D {\n      usecase U {\n        resource DB.T {\n          operations read, list:read\n        }\n      }\n    }\n  }\n  database DB {\n    table T {}\n  }\n}\n`,
  resources: `system S {\n  client C [web] {\n    resource localStorage "prefs"\n    resource indexedDB "outbox"\n  }\n}\n`,
  capabilities: `system S {\n  client C [web] {\n    capability camera\n    capability p2p-2\n    capability geolocation {\n      label "Delivery tracking"\n      description "Continuous tracking during delivery"\n    }\n    capability bluetooth {\n      description "Pairs with the scanner"\n    }\n  }\n}\n`,
} satisfies Record<PropertyKeys<KrsNode>, string>;

describe("formatter node-property coverage", () => {
  for (const [key, src] of Object.entries(FIXTURES)) {
    it(`round-trips the ${key} property through format()`, () => {
      const before = Parser.parse(src);
      expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      // The fixture must actually exercise the property it is named for.
      const beforeCount = populated(before.value, key);
      expect(beforeCount).toBeGreaterThan(0);

      const formatted = format(src);
      const after = Parser.parse(formatted);
      expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      // The property survived: this is the assertion #3101 was failing.
      expect(populated(after.value, key)).toBe(beforeCount);

      // And it survived intact, not merely in count (TPL-1101).
      expect(stripLocations(after.value)).toEqual(stripLocations(before.value));

      // Idempotent at the text level.
      expect(format(formatted)).toBe(formatted);
    });
  }
});

/**
 * How many entries `key` holds across every node with a `properties` object:
 * the array length for list-valued keys, 1 for a set scalar.
 */
function populated(root: unknown, key: string): number {
  let count = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const props = record.properties as Record<string, unknown> | undefined;
    if (props && typeof props === "object" && "kind" in record) {
      const v = props[key];
      if (Array.isArray(v)) count += v.length;
      else if (v !== undefined) count += 1;
    }
    for (const [k, v] of Object.entries(record)) {
      if (k !== "loc") visit(v);
    }
  };
  visit(root);
  return count;
}

// Local copy of the location-stripping helper used by formatter.test.ts, kept
// here so this guard file stands alone.
function stripLocations<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map((item) => stripLocations(item)) as unknown as T;
  }
  if (node instanceof Map) {
    return new Map([...node.entries()].map(([k, v]) => [k, stripLocations(v)])) as unknown as T;
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "loc") continue;
      out[key] = stripLocations(value);
    }
    return out as T;
  }
  return node;
}
