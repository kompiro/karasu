// fmt round-trip for annotation **parameters** (#2571).
//
// `@draft(confidence: "low")` came back from `karasu fmt` as a bare `@draft`,
// and `team X @deprecated(until: …)` came back as a bare `team X`: the org
// axis emitted no annotations at all. Both are the "parsed, then silently
// discarded" break ADR-2076 named and TPL-1101 forbids, on the one command
// whose contract is "reformat, change nothing".
//
// `formatter.test.ts` already asserts AST equality on every fixture it runs,
// so it would have caught this, except that no fixture ever carried a
// parameter. The top-level guard in `formatter-top-level-coverage.test.ts`
// cannot see it either: `annotationParams` is a *nested* property, not a
// `KrsFile` array. So derive the coverage here instead of enumerating it, on
// two axes:
//
//   1. every (annotation, key) pair in `ANNOTATION_PARAM_KEYS` has a fixture
//   2. every AST interface declaring `annotationParams` has a host

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { format } from "./formatter.js";
import { Parser, ANNOTATION_PARAM_KEYS } from "../parser/parser.js";

function stripLocations<T>(node: T): T {
  if (Array.isArray(node)) return node.map((item) => stripLocations(item)) as unknown as T;
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

/** parse(format(x)) ≡ parse(x), and format is idempotent at the text level. */
function expectRoundTrip(src: string): string {
  const before = Parser.parse(src);
  expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  const formatted = format(src);
  const after = Parser.parse(formatted);
  expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(stripLocations(after.value)).toEqual(stripLocations(before.value));
  expect(format(formatted)).toBe(formatted);
  return formatted;
}

/** Collect every `annotationParams` record a parsed file holds, at any depth. */
function collectParams(value: unknown): Record<string, Record<string, string>>[] {
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
  walk(value);
  return found;
}

// ── The hosts ───────────────────────────────────────────────────────────────

/**
 * One `.krs` sample per AST type that can carry annotations, built around the
 * annotation text under test. The node axis and the org axis render through
 * different code paths (`renderNode` / `renderTeam`), and #2571 broke both in
 * different ways, so a fixture that only covered one would have shipped half
 * the bug.
 */
const HOSTS = {
  node: (annotation: string) => `system S {\n  service A ${annotation} {\n    label "A"\n  }\n}\n`,
  team: (annotation: string) =>
    `organization O {\n  team T ${annotation} {\n    owns A\n  }\n}\n\nsystem S {\n  service A {}\n}\n`,
  nestedTeam: (annotation: string) =>
    `organization O {\n  team Parent {\n    team T ${annotation} {\n      owns A\n    }\n  }\n}\n\nsystem S {\n  service A {}\n}\n`,
} satisfies Record<string, (annotation: string) => string>;

/**
 * The AST interface each host exercises. Checked against `types/ast.ts` below,
 * so a third type gaining `annotationParams` fails until it gains a host.
 */
const HOST_AST_TYPES = {
  node: "BaseNodeFields",
  team: "TeamNode",
  nestedTeam: "TeamNode",
} satisfies Record<keyof typeof HOSTS, string>;

// ── The parameter pairs ─────────────────────────────────────────────────────

/** Every `annotation.key` pair the parser recognizes, as a literal union. */
type ParamPairKey = {
  [
    A in keyof typeof ANNOTATION_PARAM_KEYS
  ]: `${A & string}.${keyof (typeof ANNOTATION_PARAM_KEYS)[A] & string}`;
}[keyof typeof ANNOTATION_PARAM_KEYS];

interface ParamFixture {
  /** The parameter list as the author writes it, inside the parentheses. */
  written: string;
  /** The parameter list as the formatter must emit it. */
  emitted: string;
}

/**
 * One fixture per recognized `(annotation, key)` pair.
 *
 * `satisfies` (not a type annotation) is load-bearing, for the reason spelled
 * out in `formatter-top-level-coverage.test.ts`: it checks the key set against
 * `ANNOTATION_PARAM_KEYS` while keeping the literal keys visible. A
 * `Record<string, ParamFixture>` annotation would make the check vacuous.
 */
const FIXTURES = {
  "deprecated.until": { written: `until: "2026-Q3"`, emitted: `until: "2026-Q3"` },
  "experimental.until": { written: `until: "2026-12-31"`, emitted: `until: "2026-12-31"` },
  "draft.confidence": { written: `confidence: "low"`, emitted: `confidence: "low"` },
  "migration_target.from": { written: `from: LegacyMonolith`, emitted: `from: LegacyMonolith` },
} satisfies Record<ParamPairKey, ParamFixture>;

/** The pair set `FIXTURES` must cover exactly, derived from the parser table. */
function recognizedPairs(): string[] {
  const table: Record<string, Record<string, string>> = ANNOTATION_PARAM_KEYS;
  return Object.entries(table).flatMap(([annotation, keys]) =>
    Object.keys(keys).map((key) => `${annotation}.${key}`),
  );
}

describe("annotation parameters survive fmt (#2571)", () => {
  it("covers every recognized parameter key", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(recognizedPairs().sort());
  });

  it("covers every AST type that carries annotationParams", () => {
    const source = readFileSync(fileURLToPath(new URL("../types/ast.ts", import.meta.url)), "utf8");
    const declaring = new Set<string>();
    let current: string | undefined;
    for (const line of source.split("\n")) {
      const declaration = /^export interface (\w+)/.exec(line);
      if (declaration) current = declaration[1];
      if (/^\s*annotationParams\?:/.test(line) && current !== undefined) declaring.add(current);
    }

    expect([...declaring].sort()).toEqual([...new Set(Object.values(HOST_AST_TYPES))].sort());
  });

  for (const [pair, fixture] of Object.entries(FIXTURES) as [ParamPairKey, ParamFixture][]) {
    const [annotation, key] = pair.split(".");

    describe(`${pair}`, () => {
      for (const [host, build] of Object.entries(HOSTS)) {
        it(`round-trips on ${host}`, () => {
          const src = build(`@${annotation}(${fixture.written})`);

          // The fixture must actually reach `annotationParams`. One that
          // stopped exercising its construct would otherwise pass silently.
          const parsed = Parser.parse(src);
          expect(collectParams(parsed.value).map((p) => p[annotation]?.[key])).toContain(
            fixture.written.split(": ")[1].replaceAll('"', ""),
          );

          const formatted = expectRoundTrip(src);
          expect(formatted).toContain(`@${annotation}(${fixture.emitted})`);
        });
      }
    });
  }
});

// ── Canonical spelling ──────────────────────────────────────────────────────

// A parameter value reaches the AST as a bare string, so the author's choice
// of quoting is not recoverable and the formatter picks one spelling per value
// kind: a display-only string quotes, a node reference goes through `quoteId`
// like every other reference. What must never change is the *value*.
describe("annotation parameter values keep their meaning", () => {
  const fmtNode = (annotation: string) => format(HOSTS.node(annotation)).trimEnd();

  it("keeps an unrecognized confidence verbatim", () => {
    // `docs/spec/tags-annotations.md` promises this one explicitly: a reviewer
    // writing prose in `confidence` is recording something real.
    const src = `@draft(confidence: "we argued about this one")`;
    expect(fmtNode(src)).toContain(src);
    expectRoundTrip(HOSTS.node(src));
  });

  it("normalizes a quoted reference to bare, as it does for any id", () => {
    expect(fmtNode(`@migration_target(from: "legacy")`)).toContain(
      `@migration_target(from: legacy)`,
    );
    expectRoundTrip(HOSTS.node(`@migration_target(from: "legacy")`));
  });

  it("keeps quotes on a reference that cannot be spelled bare", () => {
    for (const value of ["my legacy", "system", "2legacy"]) {
      const src = HOSTS.node(`@migration_target(from: "${value}")`);
      expect(expectRoundTrip(src)).toContain(`@migration_target(from: "${value}")`);
    }
  });

  it("escapes a string value that contains a quote or a backslash", () => {
    const src = HOSTS.node(`@draft(confidence: "he said \\"maybe\\", then left\\\\")`);
    const parsed = Parser.parse(src);
    expect(collectParams(parsed.value)[0].draft.confidence).toBe('he said "maybe", then left\\');
    expectRoundTrip(src);
  });

  it("emits no empty parentheses for a bare annotation", () => {
    expect(fmtNode("@draft")).toContain("service A @draft {");
    expect(fmtNode("@draft")).not.toContain("@draft(");
  });

  it("keeps several annotations, parameterized or not, in the order written", () => {
    const src = `[external] @experimental(until: "2026-Q3") @draft(confidence: "high") @deprecated`;
    expect(expectRoundTrip(HOSTS.node(src))).toContain(`service A ${src} {`);
  });
});
