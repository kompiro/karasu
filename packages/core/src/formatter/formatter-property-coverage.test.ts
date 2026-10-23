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

// Comments are not in the AST, so the round trip above cannot see them
// (#3263): a comment on a property line went to the end of the file. Each
// fixture is run again with a comment above and beside every line, and every
// comment has to come back next to the same statement.
describe("formatter node-property comment placement", () => {
  for (const [key, src] of Object.entries(FIXTURES)) {
    it(`keeps comments next to the ${key} property lines`, () => {
      const lines = src.trimEnd().split("\n");
      const annotated = lines
        .flatMap((line, i) => {
          const indent = line.match(/^\s*/)?.[0] ?? "";
          return [`${indent}// above ${i}`, `${line} // beside ${i}`];
        })
        .join("\n");
      const out = format(annotated).trimEnd().split("\n");
      const outIdentity = identities(out);
      const srcIdentity = identities(lines);

      lines.forEach((_line, i) => {
        const expected = srcIdentity[i];
        const beside = out.flatMap((l, at) => (l.endsWith(`// beside ${i}`) ? [at] : []));
        expect(beside, `beside ${i}`).toHaveLength(1);
        expect(outIdentity[beside[0]], `beside ${i}`).toBe(expected);

        const above = out.findIndex((l) => l.trim() === `// above ${i}`);
        expect(above, `above ${i}`).toBeGreaterThanOrEqual(0);
        const next = out.findIndex((l, at) => at > above && !isCommentLine(l));
        expect(outIdentity[next], `above ${i}`).toBe(expected);
      });

      expect(format(format(annotated))).toBe(format(annotated));
    });
  }
});

/**
 * Which statement each line is: its keyword and first argument (without the
 * `// beside i` marker), numbered among the lines that share them. The number
 * tells two `}` apart, and the second `link` from the first, so a comment that
 * moved to a sibling does not pass. Lines that share a head keep their order
 * through formatting, so the numbering is the same on both sides.
 */
function identities(lines: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    if (isCommentLine(line)) return "";
    const head = line
      .replace(/\s*\/\/ beside \d+$/, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
    const nth = seen.get(head) ?? 0;
    seen.set(head, nth + 1);
    return `${head} #${nth}`;
  });
}

function isCommentLine(line: string): boolean {
  return line.trim().startsWith("//");
}

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
