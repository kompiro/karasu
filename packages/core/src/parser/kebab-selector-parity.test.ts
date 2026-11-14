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

interface Position {
  /** A `.krs` source that uses `name` in this position. */
  krs: (name: string) => string;
  /** The name(s) the `.krs` parser recorded for that position. */
  read: (file: KrsFile) => readonly string[] | string | undefined;
  /** A `.krs.style` rule whose selector names `name` in this field. */
  style: (name: string) => string;
  /**
   * Set when `.krs` has no way to write a kebab name in this position, with
   * the reason. The test then asserts `.krs` still refuses the spelling, so a
   * position that starts accepting it has to join the parity check.
   */
  unwritable?: string;
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
    krs: (n) => `system S {\n  service A {}\n  service B {}\n  A -> B "calls" #${id(n)}\n}\n`,
    read: (f) => f.systems[0]?.edges[0]?.authorId,
    style: (n) => `edge#${n} { line-style: dashed; }`,
    unwritable:
      "an edge id is one word after `#` (docs/spec/syntax.md, Optional edge id) and has no quoted form, so `.krs` cannot name an edge `my-team`",
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
const writable = positions.filter((p) => !("unwritable" in p));
const unwritable = positions.filter((p) => "unwritable" in p);

describe("a .krs name and a .krs.style selector with the same spelling are one name (TPL-2509)", () => {
  for (const position of writable) {
    it.each(SPELLINGS)(`${position.field}: %s`, (name) => {
      const parsed = Parser.parse(position.krs(name));
      expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const sheet = StyleParser.parse(position.style(name));
      expect(sheet.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const selector: StyleSelector | undefined = sheet.value.rules[0]?.selector;
      expect(asList(selector?.[position.field] as string[] | string | undefined)).toEqual([name]);
      expect(asList(position.read(parsed.value))).toEqual([name]);
    });
  }

  for (const position of unwritable) {
    it.each(SPELLINGS)(`${position.field}: %s cannot be written in .krs`, (name) => {
      const parsed = Parser.parse(position.krs(name));
      expect(parsed.diagnostics.some((d) => d.severity === "error")).toBe(true);
    });
  }
});
