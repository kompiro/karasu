import { describe, expect, it } from "vitest";
import type { KrsEdge } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import { assignEdgeCanonicalIds, edgeBaseId } from "./canonical-id.js";

const loc: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 2, offset: 1 },
};

function edge(partial: Partial<KrsEdge> & Pick<KrsEdge, "from" | "to">): KrsEdge {
  return {
    kind: "sync",
    tags: [],
    loc,
    ...partial,
  };
}

describe("edgeBaseId", () => {
  it("uses -> for sync edges", () => {
    expect(edgeBaseId(edge({ from: "A", to: "B" }))).toBe("A->B");
  });

  it("uses --> for async edges", () => {
    expect(edgeBaseId(edge({ from: "A", to: "B", kind: "async" }))).toBe("A-->B");
  });
});

describe("assignEdgeCanonicalIds", () => {
  it("assigns the base form when no authorId is set", () => {
    const e = edge({ from: "A", to: "B" });
    const diags = assignEdgeCanonicalIds([e]);
    expect(e.canonicalId).toBe("A->B");
    expect(diags).toEqual([]);
  });

  it("prefers the authorId over the base", () => {
    const e = edge({ from: "A", to: "B", authorId: "criticalWrite" });
    assignEdgeCanonicalIds([e]);
    expect(e.canonicalId).toBe("criticalWrite");
  });

  it("distinguishes sync and async edges between the same endpoints", () => {
    const sync = edge({ from: "A", to: "B" });
    const async = edge({ from: "A", to: "B", kind: "async" });
    const diags = assignEdgeCanonicalIds([sync, async]);
    expect(sync.canonicalId).toBe("A->B");
    expect(async.canonicalId).toBe("A-->B");
    expect(diags).toEqual([]);
  });

  it("warns and clears canonicalId when two edges share a computed base", () => {
    const a = edge({ from: "A", to: "B" });
    const b = edge({ from: "A", to: "B" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBeUndefined();
    expect(b.canonicalId).toBeUndefined();
    expect(diags).toHaveLength(2);
    expect(diags[0]).toMatchObject({
      severity: "warning",
      code: "ambiguous-edge-base",
      params: { fromId: "A", toId: "B", arrow: "->" },
    });
  });

  it("emits errors when two edges share an authorId", () => {
    const a = edge({ from: "A", to: "B", authorId: "shared" });
    const b = edge({ from: "C", to: "D", authorId: "shared" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBeUndefined();
    expect(b.canonicalId).toBeUndefined();
    expect(diags).toHaveLength(2);
    expect(diags[0]).toMatchObject({
      severity: "error",
      code: "duplicate-edge-id",
      params: { authorId: "shared" },
    });
  });

  it("treats an authorId colliding with a base as a duplicate id error", () => {
    const a = edge({ from: "A", to: "B" });
    const b = edge({ from: "C", to: "D", authorId: "A->B" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBeUndefined();
    expect(b.canonicalId).toBeUndefined();
    expect(diags.every((d) => d.code === "duplicate-edge-id")).toBe(true);
  });

  it("does not flag two unique authored ids that differ only by case", () => {
    const a = edge({ from: "A", to: "B", authorId: "foo" });
    const b = edge({ from: "C", to: "D", authorId: "Foo" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBe("foo");
    expect(b.canonicalId).toBe("Foo");
    expect(diags).toEqual([]);
  });
});
