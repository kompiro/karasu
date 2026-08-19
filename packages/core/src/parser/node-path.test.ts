import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer.js";
import { TokenType, type Token } from "../types/tokens.js";
import type { TokenCursor } from "./kebab-name.js";
import { readNodeIdPathTail, nodePathMatchesSuffix, resolveNodePathBySuffix } from "./node-path.js";
import { Parser } from "./parser.js";
import type { KrsNode } from "../types/ast.js";

const EOF_TOKEN: Token = { type: TokenType.EOF, value: "", loc: { line: 0, column: 0, offset: 0 } };

/** Lex `source`, consume the first token as the path head, expose the rest as a cursor. */
function tailCursor(source: string): { first: Token; cursor: TokenCursor } {
  const tokens = new Lexer(source).tokenize();
  let pos = 0;
  const cursor: TokenCursor = {
    peek: () => tokens[pos] ?? EOF_TOKEN,
    peekAt: (offset) => tokens[pos + offset] ?? EOF_TOKEN,
    advance: () => tokens[pos++] ?? EOF_TOKEN,
  };
  return { first: cursor.advance(), cursor };
}

describe("readNodeIdPathTail", () => {
  it("reads a single segment when no dot follows", () => {
    const { first, cursor } = tailCursor("Foo }");
    const tail = readNodeIdPathTail(first, cursor);
    expect(tail.segments).toEqual(["Foo"]);
    expect(tail.end.value).toBe("Foo");
    expect(tail.dangling).toBeUndefined();
    expect(cursor.peek().type).toBe(TokenType.RightBrace);
  });

  it("reads an unlimited dotted run by default", () => {
    const { first, cursor } = tailCursor("A.B.C from");
    const tail = readNodeIdPathTail(first, cursor);
    expect(tail.segments).toEqual(["A", "B", "C"]);
    expect(tail.end.value).toBe("C");
    expect(tail.dangling).toBeUndefined();
    expect(cursor.peek().type).toBe(TokenType.From);
  });

  it("stops at maxSegments and leaves the next dot unconsumed", () => {
    const { first, cursor } = tailCursor("A.B.C");
    const tail = readNodeIdPathTail(first, cursor, { maxSegments: 2 });
    expect(tail.segments).toEqual(["A", "B"]);
    expect(tail.dangling).toBeUndefined();
    expect(cursor.peek().type).toBe(TokenType.Dot);
  });

  it("returns the offending token as dangling, unconsumed", () => {
    const { first, cursor } = tailCursor("A. }");
    const tail = readNodeIdPathTail(first, cursor);
    expect(tail.segments).toEqual(["A"]);
    expect(tail.end.value).toBe("A");
    expect(tail.dangling?.type).toBe(TokenType.RightBrace);
    // Not consumed: the cursor still points at the same token.
    expect(cursor.peek()).toBe(tail.dangling);
  });

  it("tracks end at the last accepted segment when a later dot dangles", () => {
    const { first, cursor } = tailCursor("A.B. }");
    const tail = readNodeIdPathTail(first, cursor);
    expect(tail.segments).toEqual(["A", "B"]);
    expect(tail.end.value).toBe("B");
    expect(tail.dangling?.type).toBe(TokenType.RightBrace);
  });

  it("accepts string-literal segments only when opted in", () => {
    const accepted = tailCursor('A."B C"');
    const tail = readNodeIdPathTail(accepted.first, accepted.cursor, {
      acceptStringSegments: true,
    });
    expect(tail.segments).toEqual(["A", "B C"]);
    expect(tail.dangling).toBeUndefined();

    const rejected = tailCursor('A."B C"');
    const strict = readNodeIdPathTail(rejected.first, rejected.cursor);
    expect(strict.segments).toEqual(["A"]);
    expect(strict.dangling?.type).toBe(TokenType.StringLiteral);
  });
});

describe("nodePathMatchesSuffix", () => {
  const fullPath = ["Shop", "Api", "Customers", "Customer"];
  it.each<{ ref: string[]; expected: boolean; label: string }>([
    { ref: ["Shop", "Api", "Customers", "Customer"], expected: true, label: "full path" },
    { ref: ["Customers", "Customer"], expected: true, label: "proper suffix" },
    { ref: ["Customer"], expected: true, label: "bare id (length-1)" },
    { ref: ["Orders", "Customer"], expected: false, label: "non-suffix mismatch" },
    {
      ref: ["X", "Shop", "Api", "Customers", "Customer"],
      expected: false,
      label: "ref longer than path",
    },
    { ref: ["Api", "Customers"], expected: false, label: "mid-path sequence is not a tail" },
    { ref: [], expected: false, label: "empty ref" },
    { ref: ["customer"], expected: false, label: "case-sensitive" },
  ])("$label -> $expected", ({ ref, expected }) => {
    expect(nodePathMatchesSuffix(ref, fullPath)).toBe(expected);
  });
});

describe("resolveNodePathBySuffix", () => {
  const candidates = [
    { path: ["Shop", "Payment"], value: "shop" },
    { path: ["Billing", "Payment"], value: "billing" },
    { path: ["Shop", "Checkout", "Payment"], value: "checkout" },
    { path: ["Shop", "Api"], value: "api" },
  ];

  it("a bare id matches every same-id node, in candidate order (broadcast)", () => {
    expect(resolveNodePathBySuffix(["Payment"], candidates).map((m) => m.value)).toEqual([
      "shop",
      "billing",
      "checkout",
    ]);
  });

  it("a longer suffix narrows to the matching nodes", () => {
    expect(
      resolveNodePathBySuffix(["Checkout", "Payment"], candidates).map((m) => m.value),
    ).toEqual(["checkout"]);
  });

  it("returns empty when nothing matches", () => {
    expect(resolveNodePathBySuffix(["Nope"], candidates)).toEqual([]);
  });
});

/**
 * Pinned recovery behavior of the migrated call sites (#2547). These forms are
 * malformed; the assertions record what the parser has always produced for
 * them so the shared helper cannot silently change it. Slice C (#2549) may
 * revisit some of these shapes deliberately.
 */
describe("dotted-path site recovery (pinned behavior)", () => {
  it("edge target with a dangling dot reports once and joins the bad token's value", () => {
    const result = Parser.parse("system S {\n  service A\n  service B\n  A -> B.\n}\n");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "expected-id-or-string",
      params: { context: "qualified edge target" },
    });
    expect(result.value.systems[0]?.edges?.map((e) => e.to)).toEqual(["B.}"]);
  });

  it("edge target followed by a dotted string literal absorbs it as a segment", () => {
    const result = Parser.parse('system S {\n  service A\n  A -> B. "label"\n}\n');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.systems[0]?.edges?.map((e) => e.to)).toEqual(["B.label"]);
  });

  it("resource with a dangling dot reports once and joins the bad token's value", () => {
    const result = Parser.parse("system S {\n  service Api {\n    resource OrderDB.\n  }\n}\n");
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: "expected-id-or-string",
      params: { context: "resource child id" },
    });
    const service = result.value.systems[0]?.children?.[0] as KrsNode;
    expect(service.children?.map((c) => ({ id: c.id, ref: (c as { ref?: unknown }).ref }))).toEqual(
      [{ id: "OrderDB.}", ref: { parent: "OrderDB", child: "}" } }],
    );
  });

  it("import entry with a dangling dot reports once, skips the bad token, and keeps later entries", () => {
    const result = Parser.parse('import { A., B } from "./x.krs"\nsystem S {\n  service Svc\n}\n');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "expected-identifier",
      params: { got: "Comma", value: "," },
    });
    expect(result.value.nodeImports.map((i) => i.ids)).toEqual([[["A"], ["B"]]]);
  });

  it("entity table mapping with a dangling dot reports expected-id-after and records nothing", () => {
    const result = Parser.parse(
      "system S {\n  service Api {\n    domain Orders {\n      entity Order {\n        table OrderDB.\n      }\n    }\n  }\n}\n",
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "expected-id-after",
      params: { property: "table" },
    });
    const entity = result.value.systems[0]?.children?.[0]?.children?.[0]?.children?.[0] as KrsNode;
    expect(entity.id).toBe("Order");
    expect((entity.properties as { tableRef?: unknown }).tableRef).toBeUndefined();
  });
});
