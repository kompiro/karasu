import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { Diagnostic, KrsNode, SystemNode } from "../types/ast.js";

// The lexer drops newlines, so a reader that requires a value (a property's
// string, an edge's target, a declaration's id) used to read the source of the
// edge written on the next line as that value when the value was missing
// (#3767). Inside a node block the arrow left behind became an implicit-source
// edge, and the model changed with no diagnostic. A missing value is now
// reported from the start of the construct through the token read last, and no
// token the reader did not read becomes a value (TPL-3072, TPL-3752).

/**
 * Strip the `«…»` marker from `marked`, returning the source and the offsets
 * of the text it wrapped: the range a missing-value diagnostic must cover.
 */
function mark(marked: string): { source: string; start: number; end: number } {
  const start = marked.indexOf("«");
  const end = marked.indexOf("»") - 1;
  return { source: marked.replace("«", "").replace("»", ""), start, end };
}

/** Every edge anywhere in the parsed file, as `from -> to`. */
function edgesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) edgesIn(item, out);
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      typeof record.from === "string" &&
      typeof record.to === "string" &&
      (record.kind === "sync" || record.kind === "async")
    ) {
      const label = record.label !== undefined ? ` ${JSON.stringify(record.label)}` : "";
      out.push(`${record.from} ${record.kind === "async" ? "-->" : "->"} ${record.to}${label}`);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "loc") edgesIn(child, out);
    }
  }
  return out;
}

function parse(source: string) {
  const result = Parser.parse(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  return {
    value: result.value,
    edges: edgesIn(result.value).sort(),
    errors: errors.map((d) => d.code),
    diagnostics: errors,
  };
}

function rangeOf(d: Diagnostic): [number, number] | undefined {
  return d.loc ? [d.loc.start.offset, d.loc.end.offset] : undefined;
}

function serviceA(parsed: ReturnType<typeof parse>): KrsNode {
  const system = parsed.value.systems[0] as SystemNode;
  const a = system.children.find((child) => child.id === "a");
  if (!a) throw new Error("service a not parsed");
  return a;
}

const NEXT = `"x y" -> b`;

describe("a required value stops at an edge on a later line (#3767)", () => {
  // Each source puts the source of an edge where the value belongs, and marks
  // the construct whose value is missing.
  const IN_SERVICE = (body: string) =>
    `system S {\n  service a {\n    ${body}\n    ${NEXT}\n  }\n  service b {}\n}\n`;
  const IN_SYSTEM = (body: string) => `system S {\n  ${body}\n  ${NEXT}\n  service b {}\n}\n`;

  it.each([
    ["label", IN_SERVICE("«label»"), "expected-string-after"],
    ["description", IN_SERVICE("«description»"), "expected-string-after"],
    ["link", IN_SERVICE("«link»"), "expected-string-after"],
    ["implicit-source edge target", IN_SERVICE("«->»"), "expected-id-or-string"],
    ["implicit-source async edge target", IN_SERVICE("«-->»"), "expected-id-or-string"],
    ["explicit edge target", IN_SERVICE("«a ->»"), "expected-id-or-string"],
    ["child node id", IN_SERVICE("«domain»"), "expected-node-id"],
    ["scoped boundary id", IN_SERVICE("«boundary»"), "expected-id-or-string"],
    ["edge block label", IN_SERVICE("-> b {\n«label»"), "expected-string-after"],
    ["edge block description", IN_SERVICE("-> b {\n«description»"), "expected-string-after"],
    ["edge block link", IN_SERVICE("-> b {\n«link»"), "expected-string-after"],
    ["role", IN_SYSTEM("user u {\n«role»"), "expected-string-after"],
    ["capability label", IN_SYSTEM("client c {\ncapability k {\n«label»"), "expected-string-after"],
    ["database id", IN_SYSTEM("«database»"), "expected-node-id"],
    ["database label", IN_SYSTEM("database d {\n«label»"), "expected-string-after"],
    ["table id", IN_SYSTEM("database d {\n«table»"), "expected-node-id"],
    ["table label", IN_SYSTEM("database d {\ntable t {\n«label»"), "expected-string-after"],
    ["resource id", IN_SYSTEM("domain D {\nusecase u {\n«resource»"), "expected-node-id"],
  ])("does not read the next line's edge as the %s", (_name, marked, code) => {
    const { source, start, end } = mark(marked);
    // Close every block the marked prefix opened.
    const opened = (source.match(/\{/g) ?? []).length - (source.match(/\}/g) ?? []).length;
    const parsed = parse(source + "}\n".repeat(Math.max(0, opened)));
    const missing = parsed.diagnostics.filter((d) => d.code === code);
    expect(missing.map(rangeOf)).toEqual([[start, end]]);
    // `"x y"` appears in the model only as the source of the next line's edge.
    const json = JSON.stringify(parsed.value);
    expect(json.split('"x y"').length - 1).toBe(json.split('"from":"x y"').length - 1);
    // No arrow was left behind to become an extra edge into `b`.
    expect(parsed.edges.filter((e) => / --?> b/.test(e) && !e.startsWith("x y "))).toEqual(
      marked.includes("-> b {") ? ["a -> b"] : [],
    );
  });

  it.each([
    ["organization id", "«organization»\n" + NEXT + "\n"],
    ["team id", "organization O {\n«team»\n" + NEXT + "\n}\n"],
    ["member id", "organization O {\nteam T {\n«member»\n" + NEXT + "\n}\n}\n"],
    ["boundary id", "«boundary»\n" + NEXT + "\n"],
    ["facet id", "«facet»\n" + NEXT + "\n"],
  ])("does not read the next line's edge as the %s", (_name, marked) => {
    const { source, start, end } = mark(marked);
    const parsed = parse(source);
    const missing = parsed.diagnostics.filter((d) => d.code === "expected-id-or-string");
    expect(missing.map(rangeOf)).toEqual([[start, end]]);
    // Neither the id nor a retired positional label takes the string.
    expect(JSON.stringify(parsed.value)).not.toContain('"x y"');
    // The declaration stops at its keyword instead of taking the edge into a
    // body it never opened: the edge is reported once, on its own, as an edge
    // that cannot be written here.
    const others = parsed.diagnostics.filter((d) => d.code !== "expected-id-or-string");
    expect(others.map((d) => d.code)).toHaveLength(1);
    expect(others.map((d) => d.code)[0]).toMatch(
      /^(top-level-declaration|unexpected-token-in-block)$/,
    );
    expect(others[0].loc?.start.offset).toBe(source.indexOf('"x y"'));
  });

  it("keeps the service open after a scoped boundary with no id", () => {
    const { source, start, end } = mark(IN_SERVICE("«boundary»"));
    const parsed = parse(source);
    expect(parsed.errors).toEqual(["expected-id-or-string", "edge-source-mismatch"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
    expect(parsed.edges).toEqual(["x y -> b"]);
    expect((parsed.value.systems[0] as SystemNode).children.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it.each([
    ["child node id", IN_SERVICE("«domain»").replace(NEXT, "x --> b")],
    ["edge target", IN_SERVICE("«->»").replace(NEXT, "x --> b")],
    [
      "contains",
      `boundary B {
  «contains»
  x -> b
}
`,
    ],
    [
      "deploy node property",
      `deploy P {
  oci app {
    «image»
    x --> b
  }
}
`,
    ],
  ])("does not read a plain-id source or a `-->` edge as the %s", (_name, marked) => {
    const { source, start, end } = mark(marked);
    const parsed = parse(source);
    const missing = parsed.diagnostics.filter((d) => /^expected-/.test(d.code));
    expect(missing.map(rangeOf)).toEqual([[start, end]]);
    const json = JSON.stringify(parsed.value);
    expect(json.split('"x"').length - 1).toBe(json.split('"from":"x"').length - 1);
  });

  it.each([
    ["organization label", "organization O {\n«label»", "expected-string-after"],
    ["team label", "organization O {\nteam T {\n«label»", "expected-string-after"],
    ["member label", "organization O {\nteam T {\nmember m {\n«label»", "expected-string-after"],
    ["slack", "organization O {\nteam T {\nmember m {\n«slack»", "expected-string-after"],
    ["github", "organization O {\nteam T {\nmember m {\n«github»", "expected-string-after"],
    ["owns", "organization O {\nteam T {\n«owns»", "expected-id-after"],
    ["boundary label", "boundary B {\n«label»", "expected-string-after"],
    ["contains", "boundary B {\n«contains»", "expected-id-after"],
    ["facet label", "facet F {\n«label»", "expected-string-after"],
    ["organization link", "organization O {\n«link»", "expected-string-after"],
    ["deploy label", "deploy P {\n«label»", "expected-property-value"],
    ["deploy node label", "deploy P {\noci app {\n«label»", "expected-property-value"],
    ["deploy node property", "deploy P {\noci app {\n«image»", "expected-property-value"],
  ])("does not read the next line's edge as the %s", (_name, prefix, code) => {
    const opened = (prefix.match(/\{/g) ?? []).length;
    const { source, start, end } = mark(`${prefix}\n${NEXT}\n${"}\n".repeat(opened)}`);
    const parsed = parse(source);
    const missing = parsed.diagnostics.filter((d) => d.code === code);
    expect(missing.map(rangeOf)).toEqual([[start, end]]);
    expect(JSON.stringify(parsed.value)).not.toContain('"x y"');
  });
});

describe("an edge with no target (#3767)", () => {
  const BLOCK = (body: string) =>
    `system S {\n  service a {\n${body}\n  }\n  service b {}\n  service x {}\n}\n`;

  it("keeps the next line's quoted-source edge and drops the one with no target", () => {
    const { source, start, end } = mark(BLOCK(`    «->»\n    "x y" -> b`));
    const parsed = parse(source);
    expect(parsed.edges).toEqual(["x y -> b"]);
    expect(parsed.errors).toEqual(["expected-id-or-string", "edge-source-mismatch"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
  });

  it("keeps the next line's plain-id edge and drops the one with no target", () => {
    const parsed = parse(BLOCK(`    ->\n    x -> b`));
    expect(parsed.edges).toEqual(["x -> b"]);
    expect(parsed.errors).toEqual(["expected-id-or-string", "edge-source-mismatch"]);
  });

  it("reads the block's own name on the next line as a correct edge, once", () => {
    const parsed = parse(BLOCK(`    ->\n    "a" -> b`));
    expect(parsed.edges).toEqual(["a -> b"]);
    expect(parsed.errors).toEqual(["expected-id-or-string"]);
  });

  it("keeps the second edge at system scope", () => {
    const { source, start, end } = mark(
      `system S {\n  service a {}\n  service b {}\n  «a ->»\n  "x y" -> b\n}\n`,
    );
    const parsed = parse(source);
    expect(parsed.edges).toEqual(["x y -> b"]);
    expect(parsed.errors).toEqual(["expected-id-or-string"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
  });

  it("leaves no edge before `}` and reports at the arrow", () => {
    const { source, start, end } = mark(BLOCK(`    «->»`));
    const parsed = parse(source);
    expect(parsed.edges).toEqual([]);
    expect(parsed.errors).toEqual(["expected-id-or-string"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
  });

  it.each([
    ["property block", `    -> { label "x" }\n    label "A"`],
    ["tags", `    -> [t]\n    label "A"`],
  ])("reads its %s whole, so the next property labels the node", (_name, body) => {
    const parsed = parse(BLOCK(body));
    expect(parsed.edges).toEqual([]);
    expect(parsed.errors).toEqual(["expected-id-or-string"]);
    const a = serviceA(parsed);
    expect(a.label).toBe("A");
    // The service block was not closed early by the edge block's `}`.
    expect((parsed.value.systems[0] as SystemNode).children.map((c) => c.id)).toEqual([
      "a",
      "b",
      "x",
    ]);
  });

  it("is reported once in a block that takes no edges", () => {
    const { source, start, end } = mark(`organization O {\n  «a ->»\n}\n`);
    const parsed = parse(source);
    expect(parsed.errors).toEqual(["expected-id-or-string"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
  });

  it("is reported once before the next line's edge in a block that takes no edges", () => {
    const { source, start, end } = mark(`organization O {\n  «a ->»\n  "x y" -> b\n}\n`);
    const parsed = parse(source);
    expect(parsed.errors).toEqual(["expected-id-or-string", "unexpected-token-in-block"]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
    expect(parsed.diagnostics[1].loc?.start.offset).toBe(source.indexOf('"x y"'));
  });

  it("does not take the next line's `#id` source as its author id", () => {
    const parsed = parse(BLOCK(`    ->\n    #next -> b`));
    expect(parsed.edges).toEqual(["#next -> b"]);
    expect(parsed.errors).toEqual(["expected-id-or-string", "edge-source-mismatch"]);
  });

  it("reports a top-level edge with no target where it is placed and where it lacks a target", () => {
    const parsed = parse(`a ->\n`);
    expect(parsed.errors).toEqual(["top-level-declaration", "expected-id-or-string"]);
  });
});

describe("a link with no URL (#3767)", () => {
  const BLOCK = (body: string) => `system S {\n  service a {\n${body}\n  }\n  service b {}\n}\n`;

  it.each([
    ["before `}`", `    «link»`],
    ["before the next line's edge", `    «link»\n    "x y" -> b`],
  ])("is dropped %s and reported at `link`", (_name, body) => {
    const { source, start, end } = mark(BLOCK(body));
    const parsed = parse(source);
    expect(serviceA(parsed).properties.links).toEqual([]);
    const missing = parsed.diagnostics.filter((d) => d.code === "expected-string-after");
    expect(missing.map(rangeOf)).toEqual([[start, end]]);
    expect(missing[0].params).toEqual({ property: "link" });
    expect(parsed.errors).not.toContain("token-type-mismatch");
  });
});

describe("a missing value before `}` is reported at the construct (#3767)", () => {
  it.each([
    ["label", "«label»", "expected-string-after"],
    ["description", "«description»", "expected-string-after"],
    ["child node id", "«domain»", "expected-node-id"],
  ])("%s", (_name, body, code) => {
    const { source, start, end } = mark(`system S {\n  service a {\n    ${body}\n  }\n}\n`);
    const parsed = parse(source);
    expect(parsed.errors).toEqual([code]);
    expect(rangeOf(parsed.diagnostics[0])).toEqual([start, end]);
  });
});

describe("input that reads as written is unchanged (#3767)", () => {
  const BLOCK = (body: string) =>
    `system S {\n  service a {\n${body}\n  }\n  service b {}\n  service c {}\n  service "x y" {}\n}\n`;

  it("keeps a value on the keyword's line", () => {
    const parsed = parse(BLOCK(`    label "x y"\n    -> b`));
    expect(serviceA(parsed).label).toBe("x y");
    expect(parsed.edges).toEqual(["a -> b"]);
    expect(parsed.errors).toEqual([]);
  });

  it("keeps a value on the next line when no arrow follows it", () => {
    const parsed = parse(BLOCK(`    label\n    "x y"\n    -> b`));
    expect(serviceA(parsed).label).toBe("x y");
    expect(parsed.edges).toEqual(["a -> b"]);
    expect(parsed.errors).toEqual([]);
  });

  it("keeps an edge target on the next line when no arrow follows it", () => {
    const parsed = parse(BLOCK(`    ->\n    b`));
    expect(parsed.edges).toEqual(["a -> b"]);
    expect(parsed.errors).toEqual([]);
  });

  it("keeps an author id on the edge's line, and not one that opens the next line's edge", () => {
    const sameLine = Parser.parse(BLOCK(`    -> b #mine`));
    const edge = (sameLine.value.systems[0] as SystemNode).children[0].edges[0];
    expect(edge.authorId).toBe("mine");
    const nextLine = parse(BLOCK(`    -> b\n    #next -> c`));
    expect(nextLine.edges).toEqual(["#next -> c", "a -> b"]);
    expect(nextLine.errors).toEqual(["edge-source-mismatch"]);
  });

  it("reads a label and a second implicit-source edge on one line", () => {
    const parsed = parse(BLOCK(`    -> b "x" -> c`));
    expect(parsed.edges).toEqual(['a -> b "x"', "a -> c"]);
    expect(parsed.errors).toEqual([]);
  });

  it("reads a link and an implicit-source edge on one line", () => {
    const parsed = parse(BLOCK(`    link "https://example.com" "Docs" -> b`));
    expect(serviceA(parsed).properties.links.map((l) => [l.url, l.label])).toEqual([
      ["https://example.com", "Docs"],
    ]);
    expect(parsed.edges).toEqual(["a -> b"]);
    expect(parsed.errors).toEqual([]);
  });

  it("reads an implicit-source edge after a child block on the same line", () => {
    const parsed = parse(`system S {\n  domain A { usecase u {} -> v }\n  domain v {}\n}\n`);
    expect(parsed.edges).toEqual(["A -> v"]);
    expect(parsed.errors).toEqual([]);
  });
});
