import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";
import { createEmptyKrsFile } from "../types/ast.js";
import type { KrsFile } from "../types/ast.js";

// Exhaustiveness guard for the formatter's top-level emit list (#2076).
//
// `Printer.printFile` enumerates the top-level arrays of `KrsFile` by hand. An
// array left out of that list is not a cosmetic gap — the construct is parsed,
// then silently discarded, so `karasu fmt` destroys source the parser accepted.
// Six constructs were dropped this way (`boundary`, `legend`, `client`,
// `database`, `queue`, `storage`); a top-level `database` file, which
// `karasu translate --from db` emits by design, formatted to nothing at all.
//
// Rather than pin down only the six, this test derives the expected coverage
// from `KrsFile` itself: every array-valued key must have a fixture here, and
// every fixture must survive a format round-trip. Adding a new top-level
// construct to `KrsFile` without wiring it into the formatter fails this test.
//
// See TPL-20260510-02 (round-trip guarantee) and ADR-20260720-01.

/**
 * One `.krs` sample per array-valued `KrsFile` key. Each sample must populate
 * the keyed array when parsed — asserted below, so a fixture that silently
 * stopped exercising its construct is caught too.
 */
const FIXTURES: Record<string, string> = {
  styleImports: `@import "default.krs.style"\nsystem S {}\n`,
  nodeImports: `import { A } from "other.krs"\nsystem S {}\n`,
  systems: `system S {\n  service A { label "A" }\n}\n`,
  services: `service A {\n  label "A"\n}\n`,
  clients: `client C [web] {\n  label "C"\n}\n`,
  domains: `domain D {\n  label "D"\n}\n`,
  databases: `database DB {\n  label "DB"\n}\n`,
  queues: `queue Q {\n  label "Q"\n}\n`,
  storages: `storage St {\n  label "St"\n}\n`,
  deploys: `deploy P {\n  oci "api" {\n    runtime "Node.js 20"\n  }\n}\n`,
  organizations: `organization O {\n  team T { label "T" }\n}\n`,
  boundaries: `system S {\n  service A { label "A" }\n}\nboundary g {\n  label "G"\n  contains A\n}\n`,
  legends: `system S {\n  service A { label "A" }\n}\nlegend system "Colors" {\n  swatch #ff0000 "hot"\n  ref @deprecated "going away"\n  ref [external] "third party"\n}\n`,
};

/** Array-valued keys of a fresh `KrsFile` — the set the formatter must cover. */
function topLevelArrayKeys(): string[] {
  const empty = createEmptyKrsFile() as unknown as Record<string, unknown>;
  return Object.keys(empty).filter((key) => Array.isArray(empty[key]));
}

describe("formatter top-level coverage", () => {
  it("has a fixture for every array-valued KrsFile key", () => {
    // Sorted so a failure reads as a plain set difference.
    expect(Object.keys(FIXTURES).sort()).toEqual(topLevelArrayKeys().sort());
  });

  for (const [key, src] of Object.entries(FIXTURES)) {
    it(`round-trips top-level ${key} through format()`, () => {
      const before = Parser.parse(src);
      expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      // The fixture must actually exercise the construct it is named for.
      const beforeArray = (before.value as unknown as Record<string, unknown[]>)[key];
      expect(beforeArray.length).toBeGreaterThan(0);

      const formatted = format(src);
      const after = Parser.parse(formatted);
      expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      // The construct survived — this is the assertion #2076 was failing.
      const afterArray = (after.value as unknown as Record<string, unknown[]>)[key];
      expect(afterArray.length).toBe(beforeArray.length);

      // And it survived intact, not merely in count (TPL-20260510-02).
      expect(stripLocations(after.value)).toEqual(stripLocations(before.value));

      // Idempotent at the text level.
      expect(format(formatted)).toBe(formatted);
    });
  }

  it("preserves declaration order when top-level kinds are interleaved", () => {
    const src = [
      `database DB { label "DB" }`,
      `system S { service A { label "A" } }`,
      `legend "Colors" { swatch #ff0000 "hot" }`,
      `boundary g { contains A }`,
      `queue Q { label "Q" }`,
    ].join("\n\n");

    const out = format(src);
    const order = ["database DB", "system S", "legend", "boundary g", "queue Q"].map((needle) =>
      out.indexOf(needle),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

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

// Type-level companion to the runtime guard: if a new array-valued key is added
// to KrsFile, `FIXTURES` no longer satisfies this and typecheck fails too.
type ArrayKeys<T> = {
  [K in keyof T]-?: T[K] extends readonly unknown[] ? K : never;
}[keyof T];
const _fixturesCoverKrsFile: Record<ArrayKeys<KrsFile>, string> = FIXTURES;
void _fixturesCoverKrsFile;
