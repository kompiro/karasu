import { describe, it, expect } from "vitest";
import { edgeKey, edgeKindKey } from "./edge-key.js";

describe("edgeKindKey (#3111)", () => {
  it("keeps the `${from}->${to}#${kind}` form for an ordinary edge", () => {
    expect(edgeKindKey({ from: "Api", to: "Store", kind: "sync" })).toBe("Api->Store#sync");
    expect(edgeKindKey({ from: "Api", to: "Store", kind: "async" })).toBe("Api->Store#async");
  });

  it("gives two edges whose endpoints join to one string different keys", () => {
    expect(edgeKindKey({ from: "a", to: "b->c", kind: "sync" })).not.toBe(
      edgeKindKey({ from: "a->b", to: "c", kind: "sync" }),
    );
    // A `#` inside an endpoint cannot pose as the kind suffix.
    expect(edgeKindKey({ from: "a", to: "b#sync", kind: "async" })).not.toBe(
      edgeKindKey({ from: "a", to: "b", kind: "sync" }),
    );
  });

  it("never gives a kind-less key the form of a kind key (#3702)", () => {
    // The resolved style map holds both forms; an endpoint ending in `#sync`
    // used to make the kind-less key of one edge the kind key of another.
    expect(edgeKey({ from: "x", to: "y#sync" })).toBe('x->"y#sync"');
    expect(edgeKey({ from: "x#async", to: "y" })).toBe('"x#async"->y');
    for (const kind of ["sync", "async"] as const) {
      expect(edgeKey({ from: "x", to: `y#${kind}` })).not.toBe(
        edgeKindKey({ from: "x", to: "y", kind }),
      );
    }
  });

  it("extends edgeKey with the kind", () => {
    const edge = { from: "a", to: "b->c", kind: "sync" as const };
    expect(edgeKindKey(edge)).toBe(`${edgeKey(edge)}#sync`);
  });
});
