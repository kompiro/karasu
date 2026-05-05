import { describe, expect, it } from "vitest";
import type { KrsEdge } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import { Parser } from "../parser/parser.js";
import type { KrsFile } from "../types/ast.js";
import {
  assignEdgeCanonicalIds,
  edgeBaseId,
  validateProjectEdgeIdUniqueness,
} from "./canonical-id.js";

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

  it("clears canonicalId silently when two edges share an authorId (project-wide pass owns the diagnostic)", () => {
    const a = edge({ from: "A", to: "B", authorId: "shared" });
    const b = edge({ from: "C", to: "D", authorId: "shared" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBeUndefined();
    expect(b.canonicalId).toBeUndefined();
    expect(diags).toEqual([]);
  });

  it("clears canonicalId silently when an authorId collides with a base (project-wide pass owns the diagnostic)", () => {
    const a = edge({ from: "A", to: "B" });
    const b = edge({ from: "C", to: "D", authorId: "A->B" });
    const diags = assignEdgeCanonicalIds([a, b]);
    expect(a.canonicalId).toBeUndefined();
    expect(b.canonicalId).toBeUndefined();
    expect(diags).toEqual([]);
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

describe("validateProjectEdgeIdUniqueness", () => {
  function makeFile(systems: KrsFile["systems"]): KrsFile {
    return {
      styleImports: [],
      nodeImports: [],
      systems,
      services: [],
      clients: [],
      domains: [],
      databases: [],
      queues: [],
      storages: [],
      deploys: [],
      organizations: [],
      legends: [],
      ownerIndex: new Map(),
      nodePathIndex: new Map(),
      nodeFileIndex: new Map(),
    };
  }

  it("returns no diagnostics when all author ids are unique", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B #criticalWrite
  A -> C #anotherEdge
}
    `;
    const result = Parser.parse(krs);
    const diags = validateProjectEdgeIdUniqueness(result.value);
    expect(diags).toEqual([]);
  });

  it("flags duplicate author ids on two explicit edges in the same system", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B #shared
  A -> C #shared
}
    `;
    const result = Parser.parse(krs);
    const diags = validateProjectEdgeIdUniqueness(result.value);
    expect(diags).toHaveLength(2);
    expect(diags.every((d) => d.code === "duplicate-edge-id")).toBe(true);
    expect(diags[0].params).toMatchObject({ authorId: "shared" });
  });

  it("flags an author id shared between an explicit edge and a usecase resource row in disjoint views", () => {
    const krs = `
system S {
  database OrderDB { table OrderTable {} }
  service A {}
  service B {}
  A -> B #shared
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable #shared { operations create }
      }
    }
  }
}
    `;
    const result = Parser.parse(krs);
    const diags = validateProjectEdgeIdUniqueness(result.value);
    expect(diags).toHaveLength(2);
    expect(diags.every((d) => d.code === "duplicate-edge-id")).toBe(true);
    expect(diags[0].params).toMatchObject({ authorId: "shared" });
  });

  it("ignores edges that have no author id", () => {
    const file = makeFile([]);
    expect(validateProjectEdgeIdUniqueness(file)).toEqual([]);
  });
});
