import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { StyleParser } from "./style-parser.js";
import { quoteId } from "../formatter/quote-id.js";
import type { KrsFile } from "../types/ast.js";
import type { StyleSelector } from "../types/style.js";

// TPL-2509: a name written in `.krs` and the same spelling written in a
// `.krs.style` selector must be the same name, or the selector can never pick
// the element out. The two lexers read names differently (`.krs` stitches
// `my-team` back together from `my`, `-`, `team`; `.krs.style` reads it as one
// identifier), so every field a selector names something by is checked here.
//
// The table is keyed by the fields of `StyleSelector`, so a new selector field
// fails to compile until it says how `.krs` writes the name it selects by.
// Vocabulary positions (tags, annotations) are written bare, as an author
// writes them. Id positions are written through `quoteId`, as `karasu fmt`
// writes them, because a `.krs` id with a `-` has to be quoted.
//
// Comparing names rather than painted styles is deliberate: in `.krs language
// v2.0` a rule on a non-builtin tag matches nothing (#2677), but the two sides
// must still agree on the name.

/** Kebab-case names: plain, with a keyword fragment, with digit fragments. */
const SPELLINGS = ["my-team-internal-tag", "legacy-system", "audit-table", "phase-2", "v2-api-3"];

/** Names whose first fragment starts with a digit (#2707, #2849). */
const DIGIT_LED = ["3d-secure", "2026-q3"];

interface Position {
  /** A `.krs` source that uses `name` in this position. */
  krs: (name: string) => string;
  /** The name(s) the `.krs` parser recorded for that position. */
  read: (file: KrsFile) => readonly string[] | string | undefined;
  /** A `.krs.style` rule whose selector names `name` in this field. */
  style: (name: string) => string;
  /**
   * Set when `.krs` has no way to write these names in this position: the
   * reason, the names, and every `.krs` spelling an author could try. The
   * test asserts none of them records the name, so a position that starts
   * accepting one has to join the parity check.
   */
  unwritable?: Unwritable;
}

interface Unwritable {
  reason: string;
  names: readonly string[];
  attempts: (name: string) => readonly string[];
  /** A name every attempt records, so a refusal cannot pass because the attempt reads nothing. */
  control: string;
}

const id = quoteId;

const POSITIONS = {
  // The element kind (`service`, `edge`, ...) is a closed keyword set, not a
  // name the author coins, so no kebab spelling can reach it.
  nodeType: null,
  tags: {
    krs: (n) => `system S {\n  service A [${n}] {}\n}\n`,
    read: (f) => f.systems[0]?.children[0]?.tags,
    style: (n) => `[${n}] { border-style: dashed; }`,
  },
  annotations: {
    krs: (n) => `system S {\n  service A @${n} {}\n}\n`,
    read: (f) => f.systems[0]?.children[0]?.annotations,
    style: (n) => `@${n} { border-style: dashed; }`,
    unwritable: {
      reason:
        "the annotation reader refuses a name that starts with a digit (`@2026`); where a name may start is each call site's decision (kebab-name.ts, #2707)",
      names: DIGIT_LED,
      attempts: (n) => [
        `system S {\n  service A @${n} {}\n}\n`,
        `system S {\n  service A @${JSON.stringify(n)} {}\n}\n`,
      ],
      control: "deprecated",
    },
  },
  facets: {
    krs: (n) => `facet ${id(n)} {}\nsystem S {\n  service A {\n    facets ${id(n)}\n  }\n}\n`,
    read: (f) => f.systems[0]?.children[0]?.facets,
    style: (n) => `[facets=${n}] { border-style: dashed; }`,
  },
  id: {
    krs: (n) => `system S {\n  service ${id(n)} {}\n}\n`,
    read: (f) => f.systems[0]?.children[0]?.id,
    style: (n) => `#${n} { border-style: dashed; }`,
  },
  edgeId: {
    krs: (n) => `system S {\n  service A {}\n  service B {}\n  A -> B "calls" #${n}\n}\n`,
    read: (f) => f.systems[0]?.edges[0]?.authorId,
    style: (n) => `edge#${n} { line-style: dashed; }`,
    unwritable: {
      reason:
        "an edge id is one word after `#` (docs/spec/syntax.md, Optional edge id) with no quoted form, so `.krs` cannot name an edge `my-team`",
      names: [...SPELLINGS, ...DIGIT_LED],
      attempts: (n) => [
        `system S {\n  service A {}\n  service B {}\n  A -> B "calls" #${n}\n}\n`,
        `system S {\n  service A {}\n  service B {}\n  A -> B "calls" #${JSON.stringify(n)}\n}\n`,
      ],
      control: "calls1",
    },
  },
  boundaryId: {
    krs: (n) => `system S {\n  service A {}\n}\nboundary ${id(n)} {\n  contains A\n}\n`,
    read: (f) => f.boundaries[0]?.id,
    style: (n) => `boundary#${n} { border-style: dashed; }`,
  },
  edgeFrom: {
    krs: (n) => `system S {\n  service ${id(n)} {}\n  service B {}\n  ${id(n)} -> B\n}\n`,
    read: (f) => f.systems[0]?.edges[0]?.from,
    style: (n) => `edge[from=${n}] { line-style: dashed; }`,
  },
  edgeTo: {
    krs: (n) => `system S {\n  service A {}\n  service ${id(n)} {}\n  A -> ${id(n)}\n}\n`,
    read: (f) => f.systems[0]?.edges[0]?.to,
    style: (n) => `edge[to=${n}] { line-style: dashed; }`,
  },
} satisfies Record<Exclude<keyof StyleSelector, "loc">, Position | null>;

const asList = (v: readonly string[] | string | undefined): readonly string[] =>
  v === undefined ? [] : typeof v === "string" ? [v] : v;

const positions = Object.entries(POSITIONS).flatMap(([field, position]) =>
  position === null ? [] : [{ field: field as keyof typeof POSITIONS, ...position }],
);

/** The names each position is checked with: every name `.krs` can write there. */
const cases = positions.flatMap((position) => {
  const refused = new Set(("unwritable" in position && position.unwritable.names) || []);
  return [...SPELLINGS, ...DIGIT_LED]
    .filter((name) => !refused.has(name))
    .map((name) => ({ position, name }));
});

const refusals = positions.flatMap((position) =>
  "unwritable" in position
    ? position.unwritable.names.flatMap((name) =>
        position.unwritable
          .attempts(name)
          .map((source) => ({ position, name, source, reason: position.unwritable.reason })),
      )
    : [],
);

const controls = positions.flatMap((position) =>
  "unwritable" in position
    ? position.unwritable
        .attempts(position.unwritable.control)
        .slice(0, 1)
        .map((source) => ({ position, name: position.unwritable.control, source }))
    : [],
);

describe("a .krs name and a .krs.style selector with the same spelling are one name (TPL-2509)", () => {
  it.each(cases)("$position.field: $name", ({ position, name }) => {
    const parsed = Parser.parse(position.krs(name));
    expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const sheet = StyleParser.parse(position.style(name));
    expect(sheet.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const selector: StyleSelector | undefined = sheet.value.rules[0]?.selector;
    expect(asList(selector?.[position.field] as string[] | string | undefined)).toEqual([name]);
    expect(asList(position.read(parsed.value))).toEqual([name]);
  });

  it.each(refusals)(
    "$position.field: .krs refuses $name ($reason)",
    ({ position, name, source }) => {
      const parsed = Parser.parse(source);
      expect(asList(position.read(parsed.value))).not.toContain(name);
      expect(parsed.diagnostics.some((d) => d.severity === "error")).toBe(true);
    },
  );

  it.each(controls)(
    "$position.field: the refusal's .krs reads $name",
    ({ position, name, source }) => {
      const parsed = Parser.parse(source);
      expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(asList(position.read(parsed.value))).toEqual([name]);
    },
  );
});
