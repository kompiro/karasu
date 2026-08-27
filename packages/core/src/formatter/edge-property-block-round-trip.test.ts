import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";

// `karasu fmt` over the edge property block (#2543). The canonicalization rule
// is a single condition — does the block carry anything besides `label` — and
// this file fences both sides of it, plus the round-trip and idempotence
// TPL-1101 / TPL-2542 ask for.

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

function expectAstRoundTrip(src: string): void {
  const before = Parser.parse(src);
  expect(before.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const after = Parser.parse(format(src));
  expect(after.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(stripLocations(after.value)).toEqual(stripLocations(before.value));
}

function expectIdempotent(src: string): void {
  const once = format(src);
  expect(format(once)).toBe(once);
}

const wrap = (edge: string) => `system Shop {\n  service A {}\n  service B {}\n  ${edge}\n}\n`;

describe("karasu fmt — edge property block (#2543)", () => {
  it("folds a label-only block back to the shorthand", () => {
    const formatted = format(wrap(`A -> B {\n    label "calls"\n  }`));
    expect(formatted).toContain(`A -> B "calls"`);
    expect(formatted).not.toContain("label");
  });

  it("keeps the block once it carries a description", () => {
    const formatted = format(wrap(`A -> B {\n    description "At-least-once."\n  }`));
    expect(formatted).toContain("A -> B {");
    expect(formatted).toContain(`    description "At-least-once."`);
  });

  it("moves a positional label into the block when the block earns one", () => {
    const formatted = format(wrap(`A -> B "calls" {\n    description "At-least-once."\n  }`));
    // The input is a duplicate-label error only when the block also writes
    // `label`; a positional label plus a description-only block is valid.
    expect(formatted).toContain("A -> B {");
    expect(formatted).toContain(`    label "calls"`);
    expect(formatted).toContain(`    description "At-least-once."`);
    expect(formatted).not.toContain(`A -> B "calls"`);
  });

  it("keeps a link-only block as a block", () => {
    const formatted = format(
      wrap(`A -> B {\n    link "https://runbook.example.com/x" "Runbook"\n  }`),
    );
    expect(formatted).toContain("A -> B {");
    expect(formatted).toContain(`    link "https://runbook.example.com/x" "Runbook"`);
  });

  it("round-trips and is idempotent for the block form", () => {
    const src = wrap(
      `A --> B [important] #orderPlaced {\n` +
        `    label       "places an order"\n` +
        `    description "At-least-once. Retries are idempotent on orderId."\n` +
        `    link        "https://runbook.example.com/order-placed" "Runbook"\n` +
        `  }`,
    );
    expectAstRoundTrip(src);
    expectIdempotent(src);
  });

  it("round-trips the shorthand unchanged", () => {
    const src = wrap(`A -> B "calls" [important]`);
    expectAstRoundTrip(src);
    expect(format(src)).toContain(`A -> B "calls" [important]`);
  });

  // Found while fencing the block against `#<id>`: renderEdge dropped the
  // author id outright, so `karasu fmt` deleted the target of every
  // `edge#<id>` style selector.
  it("preserves an author-supplied #<id> in both forms", () => {
    expect(format(wrap(`A -> B "calls" [important] #criticalWrite`))).toContain(
      `A -> B "calls" [important] #criticalWrite`,
    );
    expect(format(wrap(`A -> B #criticalWrite {\n    description "why"\n  }`))).toContain(
      "A -> B #criticalWrite {",
    );
    expectAstRoundTrip(wrap(`A -> B "calls" [important] #criticalWrite`));
  });

  it("keeps a trailing comment on the line that opens the block", () => {
    const formatted = format(wrap(`A -> B { // hand-off\n    description "At-least-once."\n  }`));
    expect(formatted).toContain("A -> B { // hand-off");
  });

  // A block edge is the first KrsEdge that spans more than one line. The
  // formatter decides which comments lead the *next* sibling from the last line
  // the previous item occupied, so a range that stopped at the target handed the
  // block's own comments to the edge after it.
  it("does not hand a comment inside the block to the next sibling", () => {
    const src =
      `system Shop {\n` +
      `  service A {}\n` +
      `  service B {}\n` +
      `  service C {}\n` +
      `  service D {}\n` +
      `  A -> B [async] #orderPlaced {\n` +
      `    label       "places an order"\n` +
      `    description "note" // why though\n` +
      `  }\n` +
      `  // leading comment for C -> D\n` +
      `  C -> D\n` +
      `}\n`;
    const formatted = format(src);
    const lines = formatted.split("\n");
    const cIndex = lines.findIndex((l) => l.trim() === "C -> D");
    expect(cIndex).toBeGreaterThan(-1);
    // Only the comment the author put on the C -> D edge leads it. The block's
    // own comment lands in the file footer, which is the documented v1
    // behaviour for a comment inside any block body (see `format()`).
    expect(lines[cIndex - 1]).toContain("leading comment for C -> D");
    expect(lines[cIndex - 2].trim()).toBe("}");
    expectIdempotent(src);
  });

  it("preserves the implicit-source shorthand inside a service block", () => {
    const src = `system Shop {\n  service A {\n    -> B {\n      description "depends on B"\n    }\n  }\n  service B {}\n}\n`;
    const formatted = format(src);
    expect(formatted).toContain("-> B {");
    expect(formatted).not.toContain("A -> B {");
    expectAstRoundTrip(src);
    expectIdempotent(src);
  });
});
