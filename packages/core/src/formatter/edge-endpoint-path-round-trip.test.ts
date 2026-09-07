import { describe, it, expect } from "vitest";
import { format } from "./formatter.js";
import { Parser } from "../parser/parser.js";

// `karasu fmt` over a qualified edge endpoint (#2650). The endpoint used to be
// the one reference site that re-spelled the author's path as a single quoted
// literal, because `KrsEdge.to` arrives pre-joined and `quoteId` sees the dots
// as characters that cannot go bare. What every case here fences is the same
// rule the sibling sites follow: quote per segment, never the whole path.
//
// The AST round trip TPL-1101 asks for cannot see this on its own — a quoted
// target parses back to the identical `to` — so each case pins the emitted
// spelling as well.

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

/** Format `src`, and assert its AST and its second formatting are stable. */
function formatted(src: string): string {
  expectAstRoundTrip(src);
  expectIdempotent(src);
  return format(src);
}

const DEEP_TARGET =
  `system Shop {\n  service Checkout {\n    domain Payment {}\n  }\n}\n\n` +
  `system Portal {\n  service Web {\n    -> Shop.Checkout.Payment "settle"\n  }\n}\n`;

describe("karasu fmt — qualified edge endpoint (#2650)", () => {
  it("keeps a deep path bare, the way realizes / owns / contains do", () => {
    const out = formatted(DEEP_TARGET);
    expect(out).toContain(`-> Shop.Checkout.Payment "settle"`);
    expect(out).not.toContain(`"Shop.Checkout.Payment"`);
  });

  it("keeps the two-segment cross-system form bare", () => {
    const out = formatted(
      `system Shop {\n  service Checkout {}\n}\n\n` +
        `system Portal {\n  service Web {\n    -> Shop.Checkout "settle"\n  }\n}\n`,
    );
    expect(out).toContain(`-> Shop.Checkout "settle"`);
    expect(out).not.toContain(`"Shop.Checkout"`);
  });

  it("keeps the path bare when the edge carries a property block", () => {
    const out = formatted(
      `system Shop {\n  service Checkout {\n    domain Payment {}\n  }\n}\n\n` +
        `system Portal {\n  service Web {\n    -> Shop.Checkout.Payment {\n` +
        `      description "settles the basket"\n    }\n  }\n}\n`,
    );
    expect(out).toContain(`-> Shop.Checkout.Payment {`);
    expect(out).not.toContain(`"Shop.Checkout.Payment"`);
  });

  it("keeps the path bare on an explicit source, not only the implicit one", () => {
    const out = formatted(
      `system Shop {\n  service Checkout {\n    domain Payment {}\n  }\n}\n\n` +
        `system Portal {\n  service Web {}\n  Web -> Shop.Checkout.Payment "settle"\n}\n`,
    );
    expect(out).toContain(`Web -> Shop.Checkout.Payment "settle"`);
  });

  it("keeps the path bare on an entity relation", () => {
    const out = formatted(
      `system Shop {\n  service Sales {\n    domain Orders {\n      entity Order {\n` +
        `        -> Sales.Customers.Customer\n      }\n    }\n\n` +
        `    domain Customers {\n      entity Customer {}\n    }\n  }\n}\n`,
    );
    expect(out).toContain(`-> Sales.Customers.Customer`);
    expect(out).not.toContain(`"Sales.Customers.Customer"`);
  });

  it("quotes only the segment that needs it, not the path around it", () => {
    // A dot inside a quoted segment is data, and a segment that collides with a
    // keyword still has to keep its quotes. Both survive because each segment
    // goes through `quoteId` on its own.
    const out = formatted(
      `system Shop {\n  service Checkout {\n    domain "pay.core" {}\n  }\n}\n\n` +
        `system Portal {\n  service Web {\n    -> Shop.Checkout."pay.core" "settle"\n  }\n}\n`,
    );
    expect(out).toContain(`-> Shop.Checkout."pay.core" "settle"`);
  });

  it("still quotes a single id that happens to contain a dot", () => {
    // `"b.c"` is one segment, not a path: the author wrote one token and the
    // formatter has to write one back, or the reference changes meaning.
    const out = formatted(
      `system Shop {\n  service A {}\n  service "b.c" {}\n  A -> "b.c" "calls"\n}\n`,
    );
    expect(out).toContain(`A -> "b.c" "calls"`);
  });

  it("records the segments it joined, so the two spellings cannot drift", () => {
    const edge = Parser.parse(DEEP_TARGET).value.systems[1].children[0].edges[0];
    expect(edge.toPath).toEqual(["Shop", "Checkout", "Payment"]);
    expect(edge.to).toBe("Shop.Checkout.Payment");
  });

  it("leaves a bare endpoint without a path, so it renders exactly as before", () => {
    const edge = Parser.parse(`system Shop {\n  service A {}\n  service B {}\n  A -> B\n}\n`).value
      .systems[0].edges[0];
    expect(edge.toPath).toBeUndefined();
  });

  it("keeps the dangling-dot recovery joining what it records", () => {
    // The recovery that predates this change folds the offending token into the
    // target. `toPath` is built from the same array, so a reader of either
    // spelling sees the same thing.
    const r = Parser.parse(`system Shop {\n  service A {}\n  A -> B.\n}\n`);
    expect(r.diagnostics.some((d) => d.code === "expected-id-or-string")).toBe(true);
    const edge = r.value.systems[0].edges[0];
    expect(edge.toPath?.join(".")).toBe(edge.to);
  });
});
