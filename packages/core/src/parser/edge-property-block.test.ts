import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { KrsEdge, SystemNode } from "../types/ast.js";

// The edge property block (#2543). The shorthand `A -> B "calls"` and the block
// `A -> B { label "calls" }` are two spellings of one edge, so the observation
// this file fences is TPL-2542's: both must land on one AST, and the extra
// spelling must not open a way to state the same fact twice.

function edgesOf(src: string): KrsEdge[] {
  const result = Parser.parse(src);
  const system = result.value.systems[0] as SystemNode | undefined;
  return system?.edges ?? [];
}

function errorCodes(src: string): string[] {
  return Parser.parse(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
}

/** Strip every `loc` so two spellings can be compared on structure alone. */
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

const wrap = (edge: string) => `system Shop {\n  service A {}\n  service B {}\n  ${edge}\n}\n`;

describe("edge property block (#2543)", () => {
  it("lands the shorthand and a label-only block on the same AST", () => {
    const shorthand = edgesOf(wrap(`A -> B "calls"`));
    const block = edgesOf(wrap(`A -> B {\n    label "calls"\n  }`));

    expect(errorCodes(wrap(`A -> B {\n    label "calls"\n  }`))).toEqual([]);
    expect(stripLocations(block)).toEqual(stripLocations(shorthand));
  });

  it("reads description and link, which the shorthand cannot express", () => {
    const [edge] = edgesOf(
      wrap(
        `A -> B {\n` +
          `    label       "calls"\n` +
          `    description "At-least-once. Retries are idempotent on orderId."\n` +
          `    link        "https://runbook.example.com/order" "Runbook"\n` +
          `    link        "https://dash.example.com/order"\n` +
          `  }`,
      ),
    );

    expect(edge.label).toBe("calls");
    expect(edge.description).toBe("At-least-once. Retries are idempotent on orderId.");
    expect(edge.links?.map((l) => [l.url, l.label])).toEqual([
      ["https://runbook.example.com/order", "Runbook"],
      ["https://dash.example.com/order", undefined],
    ]);
  });

  it("leaves description and links undefined — not empty — when no block is written", () => {
    const [edge] = edgesOf(wrap(`A -> B "calls"`));
    expect(edge.description).toBeUndefined();
    expect(edge.links).toBeUndefined();
  });

  it("keeps tags and #<id> outside the block", () => {
    const [edge] = edgesOf(
      wrap(`A --> B [important] #orderPlaced {\n    description "async hand-off"\n  }`),
    );
    expect(edge.kind).toBe("async");
    expect(edge.tags).toEqual(["important"]);
    expect(edge.authorId).toBe("orderPlaced");
    expect(edge.description).toBe("async hand-off");
  });

  it("raises duplicate-edge-label when the label is written both ways", () => {
    const src = wrap(`A -> B "calls" {\n    label "invokes"\n  }`);
    expect(errorCodes(src)).toEqual(["duplicate-edge-label"]);
    // Recovery keeps the positional label rather than letting the block win.
    expect(edgesOf(src)[0].label).toBe("calls");
  });

  // Narrowing has to happen inside one predicate: `Diagnostic` is a union keyed
  // on `code`, and a prior `.filter()` does not carry the refinement.
  function edgeBlockErrors(src: string) {
    return Parser.parse(src).diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        d.code === "unexpected-token-in-block" &&
        d.params.blockKind === "edge",
    );
  }

  it("rejects any other keyword inside the block", () => {
    expect(edgeBlockErrors(wrap(`A -> B {\n    bogus\n  }`))).toHaveLength(1);
  });

  it("does not accept facets on an edge, which is slice B (#2544)", () => {
    // The spec sentences excluding edges from facets stay true after this
    // slice, so `facets` must not slip in via the new block.
    expect(edgeBlockErrors(wrap(`A -> B {\n    facets pii\n  }`)).length).toBeGreaterThan(0);
  });

  it("parses on both sides of an edge block, so a bad block does not swallow the rest", () => {
    const src = `system Shop {\n  service A {}\n  service B {}\n  A -> B {\n    bogus\n  }\n  service C {}\n}\n`;
    const result = Parser.parse(src);
    const system = result.value.systems[0] as SystemNode;
    expect(system.children.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  // Slice E (#2645) lifted the qualified target to any depth while this block
  // was in flight. `parseEdge` runs the two readers back to back — the path
  // tail, then the block — so neither may eat the other's tokens (TPL-2542).
  it("keeps a deep qualified target and its block payload on one edge", () => {
    const result = Parser.parse(
      `system Shop {\n  service Checkout {\n    domain Payment {}\n  }\n}\n` +
        `system Portal {\n  service Web {\n    --> Shop.Checkout.Payment [async] #settle {\n` +
        `      description "settles the basket"\n      link "https://runbook.example.com/settle"\n` +
        `    }\n  }\n}\n`,
    );
    expect(result.diagnostics).toEqual([]);
    const portal = result.value.systems[1] as SystemNode;
    const service = portal.children[0] as { edges: KrsEdge[] };
    const [edge] = service.edges;
    expect(edge.to).toBe("Shop.Checkout.Payment");
    expect(edge.kind).toBe("async");
    expect(edge.authorId).toBe("settle");
    expect(edge.description).toBe("settles the basket");
    expect(edge.links?.map((l) => l.url)).toEqual(["https://runbook.example.com/settle"]);
  });

  it("accepts the block on an implicit-source edge inside a service", () => {
    const result = Parser.parse(
      `system Shop {\n  service A {\n    -> B {\n      description "depends on B"\n    }\n  }\n  service B {}\n}\n`,
    );
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const system = result.value.systems[0] as SystemNode;
    const service = system.children[0] as { edges: KrsEdge[] };
    expect(service.edges[0].description).toBe("depends on B");
  });
});
