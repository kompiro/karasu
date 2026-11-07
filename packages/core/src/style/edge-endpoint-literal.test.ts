import { describe, it, expect } from "vitest";
import { edgeBaseForm, styleEndpointLiteral } from "./edge-endpoint-literal.js";
import { StyleParser } from "../parser/style-parser.js";

describe("styleEndpointLiteral (#3480)", () => {
  it.each([
    "OrderService",
    "OrderDB.OrderTable",
    "注文API",
    "3d-secure",
    "123",
    "-1",
    "add-on",
    "face",
    "Feed.Items",
  ])("leaves %s bare: it is one style identifier", (endpoint) => {
    expect(styleEndpointLiteral(endpoint)).toBe(endpoint);
  });

  it.each([
    ["a b", '"a b"'],
    ["b->c", '"b->c"'],
    ["a-->b", '"a-->b"'],
    ['a"b', '"a\\"b"'],
    ["a\\b", '"a\\\\b"'],
    ["a!", '"a!"'],
    ["", '""'],
  ])("quotes %s: the style lexer does not read it as that one identifier", (endpoint, literal) => {
    expect(styleEndpointLiteral(endpoint)).toBe(literal);
  });

  // The two cases a lone lexer check misses: an arrow after the endpoint
  // swallows a trailing `-`, and `#abc` is a color token, not an id.
  it.each([
    ["a-", '"a-"'],
    ["b-", '"b-"'],
    ["#abc", '"#abc"'],
    ["#db", '"#db"'],
  ])("quotes %s by position", (endpoint, literal) => {
    expect(styleEndpointLiteral(endpoint)).toBe(literal);
  });

  it("keeps the base form of identifier endpoints as the plain join", () => {
    expect(edgeBaseForm("PlaceOrder", "->", "OrderDB.OrderTable")).toBe(
      "PlaceOrder->OrderDB.OrderTable",
    );
    expect(edgeBaseForm("A", "-->", "B")).toBe("A-->B");
  });
});

// The base form is written into `.krs.style` as `edge#<base>` (the app's
// right-click menu does exactly that), so the guarantee is a round trip through
// the real parser, at the real position, for every shape the lexer reads
// differently (TPL-3480).
describe("edge base form round-trips through edge#<base> (#3480)", () => {
  const ENDPOINTS = [
    "a",
    "c",
    "a-",
    "b-",
    "face",
    "Feed.Items",
    "Feed.x",
    "abc--d",
    "abc",
    "123",
    "123.4",
    "1e3",
    "-1",
    "-1x",
    "3d-secure",
    "#abc",
    "#db",
    "#",
    'a"b',
    "a\\b",
    "a b",
    " ",
    "",
    "a->b",
    "b->c",
    "a-->b",
    "a\nb",
    "注文API",
    "café",
    "😀",
    "OrderDB.OrderTable",
    "a.b.c",
    "x{y}",
    "a!",
  ];
  const ARROWS = ["->", "-->"] as const;
  const triples = ENDPOINTS.flatMap((from) =>
    ARROWS.flatMap((arrow) => ENDPOINTS.map((to) => ({ from, arrow, to }))),
  );

  it("parses edge#<base> back to the same base with no diagnostic", () => {
    const failures: string[] = [];
    for (const { from, arrow, to } of triples) {
      const base = edgeBaseForm(from, arrow, to);
      const result = StyleParser.parse(`edge#${base} { color: red; }`);
      const edgeId = result.value.rules[0]?.selector.edgeId;
      if (result.diagnostics.length > 0 || edgeId !== base) {
        failures.push(`${JSON.stringify([from, arrow, to])} → ${base} → ${edgeId}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("gives different endpoint pairs different bases", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const { from, arrow, to } of triples) {
      const base = edgeBaseForm(from, arrow, to);
      const key = JSON.stringify([from, arrow, to]);
      const other = seen.get(base);
      if (other !== undefined) collisions.push(`${other} and ${key} → ${base}`);
      seen.set(base, key);
    }
    expect(collisions).toEqual([]);
  });

  it("reads [from=] / [to=] back to the endpoint", () => {
    const failures: string[] = [];
    for (const endpoint of ENDPOINTS) {
      const literal = styleEndpointLiteral(endpoint);
      const result = StyleParser.parse(`edge[from=${literal}][to=${literal}] { color: red; }`);
      const selector = result.value.rules[0]?.selector;
      if (
        result.diagnostics.length > 0 ||
        selector?.edgeFrom !== endpoint ||
        selector?.edgeTo !== endpoint
      ) {
        failures.push(`${JSON.stringify(endpoint)} → ${literal}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
