import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { KrsEdge, KrsNode, LinkEntry, SystemNode } from "../types/ast.js";

// The lexer drops newlines, so a reader that takes an optional trailing string
// (an edge's positional label, a link's label) used to read the quoted source
// of the edge on the next line as that label (#3752). At system scope the
// second edge was lost; inside a node block the arrow left behind became an
// implicit-source edge, and the model changed with no diagnostic.

interface Parsed {
  edges: string[];
  links: string[];
  errors: string[];
}

function describeEdge(edge: KrsEdge): string {
  const arrow = edge.kind === "async" ? "-->" : "->";
  const label = edge.label !== undefined ? ` ${JSON.stringify(edge.label)}` : "";
  return `${edge.from} ${arrow} ${edge.to}${label}`;
}

function collect(node: KrsNode, edges: string[], links: string[]): void {
  for (const edge of (node as { edges?: KrsEdge[] }).edges ?? []) edges.push(describeEdge(edge));
  const nodeLinks = (node as { properties?: { links?: LinkEntry[] } }).properties?.links ?? [];
  for (const link of nodeLinks) {
    links.push(`${link.url}${link.label !== undefined ? ` ${JSON.stringify(link.label)}` : ""}`);
  }
  for (const child of (node as { children?: KrsNode[] }).children ?? [])
    collect(child, edges, links);
}

function parse(src: string): Parsed {
  const result = Parser.parse(src);
  const edges: string[] = [];
  const links: string[] = [];
  for (const system of result.value.systems as SystemNode[]) collect(system, edges, links);
  const errors = result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  return { edges: edges.sort(), links, errors };
}

const SYSTEM = (body: string) =>
  `system S {\n  service a {}\n  service "b->c" {}\n  service "a->b" {}\n  service c {}\n  service "x" {}\n${body}\n}\n`;

describe("an optional string stops at an edge on a later line (#3752)", () => {
  describe("at system scope", () => {
    it.each([
      ["->", `  a -> "b->c"\n  "a->b" -> c`, ["a -> b->c", "a->b -> c"]],
      ["-->", `  a --> "b->c"\n  "a->b" --> c`, ["a --> b->c", "a->b --> c"]],
    ])("reads a quoted source on the next line as its own edge (%s)", (_arrow, body, expected) => {
      const parsed = parse(SYSTEM(body));
      expect(parsed.edges).toEqual([...expected].sort());
      expect(parsed.errors).toEqual([]);
    });

    it("reads the same edges in either order", () => {
      const forward = parse(SYSTEM(`  "a->b" -> c\n  a -> "b->c"`));
      const reversed = parse(SYSTEM(`  a -> "b->c"\n  "a->b" -> c`));
      expect(reversed).toEqual(forward);
    });

    it("reads a quoted source after a plain-id edge as its own edge", () => {
      expect(parse(SYSTEM(`  a -> c\n  "x" -> c`)).edges).toEqual(["a -> c", "x -> c"]);
    });
  });

  describe("inside a node block", () => {
    const BLOCK = (body: string) =>
      `system S {\n  service a {\n${body}\n  }\n  service b {}\n  service c {}\n  service "x y" {}\n}\n`;

    it("does not read the next line's source as an implicit edge's label", () => {
      const parsed = parse(BLOCK(`    -> b\n    "x y" -> b`));
      // No label on `a -> b`, and no second `a -> b` built from the arrow left behind.
      expect(parsed.edges).not.toContain('a -> b "x y"');
      expect(parsed.edges.filter((e) => e === "a -> b")).toHaveLength(1);
      expect(parsed.errors).toEqual(["edge-source-mismatch"]);
    });

    it("reads a source that is the node itself as its own edge", () => {
      const parsed = parse(BLOCK(`    -> b\n    "a" -> c`));
      expect(parsed.edges).toEqual(["a -> b", "a -> c"]);
      expect(parsed.errors).toEqual([]);
    });

    it("does not read the next line's source as a link's label", () => {
      const parsed = parse(BLOCK(`    link "https://example.com"\n    "x y" -> b`));
      expect(parsed.links).toEqual(["https://example.com"]);
      expect(parsed.edges).not.toContain("a -> b");
      expect(parsed.errors).toEqual(["edge-source-mismatch"]);
    });

    it("still reads a link label on the next line that no arrow follows", () => {
      const parsed = parse(BLOCK(`    link "https://example.com"\n      "Docs"`));
      expect(parsed.links).toEqual(['https://example.com "Docs"']);
      expect(parsed.errors).toEqual([]);
    });
  });

  describe("after a trailing dot", () => {
    // A plain id on the next line already stopped there (#3499); a quoted one
    // became the label and took one more error with it.
    it.each([
      ["a quoted source", `  a -> S.\n  "x" -> c`],
      ["a plain source", `  a -> S.\n  c -> a`],
    ])("keeps the next line's edge with %s", (_name, body) => {
      const parsed = parse(SYSTEM(body));
      expect(parsed.errors).toEqual(["expected-id-or-string"]);
      expect(parsed.edges).toHaveLength(2);
      expect(parsed.edges.some((e) => e.includes('"'))).toBe(false);
    });
  });

  describe("what stays the same", () => {
    const PLAIN = (body: string) =>
      `system S {\n  service a {\n${body}\n  }\n  service b {}\n  service c {}\n}\n`;

    it("reads a label written on the line after the target", () => {
      const parsed = parse(
        `system S {\n  service a {}\n  service b {}\n  a -> b\n    "calls"\n}\n`,
      );
      expect(parsed.edges).toEqual(['a -> b "calls"']);
      expect(parsed.errors).toEqual([]);
    });

    it("reads a next-line label before an implicit-source edge as a label", () => {
      // The string is followed by an arrow, but on the line after, where it
      // opens the implicit-source edge `-> c`.
      const parsed = parse(PLAIN(`    -> b\n    "calls"\n    -> c`));
      expect(parsed.edges).toEqual(['a -> b "calls"', "a -> c"]);
      expect(parsed.errors).toEqual([]);
    });

    it("keeps a string and a stray arrow on one line a label and an error", () => {
      const parsed = parse(
        `system S {\n  service a {}\n  service b {}\n  service c {}\n  a -> b "x" -> c\n}\n`,
      );
      expect(parsed.edges).toEqual(['a -> b "x"']);
      expect(parsed.errors).toHaveLength(2);
    });
  });
});
