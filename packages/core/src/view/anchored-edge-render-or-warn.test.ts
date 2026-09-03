import { describe, it, expect } from "vitest";
import { extractView, extractEntityView } from "./view-extract.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { layout } from "../renderer/layout.js";
import { Parser } from "../parser/parser.js";
import { analyze } from "../resolver/warnings.js";
import type { KrsFile, KrsNode, ParseResult } from "../types/ast.js";

/**
 * TPL-2075 in executable form: an edge the parser accepts is either drawn on
 * some view or reported — never silently dropped, and never both.
 *
 * The view side (`collectAnchoredPeerEdges` in `view-extract.ts`) and the
 * diagnostic side (`peersOf` in `resolver/warnings.ts`) implement the same peer
 * rule from opposite directions, so this table is what stops one of them from
 * being changed alone (#2075 gave the rule its diagnostic, #2223 gave the
 * service-anchored spelling its canvas).
 */

/** Every view path in the model: the root, plus one per node. */
function allViewPaths(systems: KrsNode[]): string[][] {
  const paths: string[][] = [[]];
  const walk = (node: KrsNode, prefix: string[]): void => {
    const path = [...prefix, node.id];
    paths.push(path);
    for (const child of node.children) walk(child, path);
  };
  for (const system of systems) walk(system, []);
  return paths;
}

/**
 * Does `from -> to` come out of **layout** on any view?
 *
 * Deliberately not asserted against `extractView`: the multi-system and
 * `__unassigned__` roots lay each system out from its own edge list rather
 * than from the extracted slice, so a slice-level assertion would pass on a
 * canvas that draws nothing (#2223).
 */
function rendersAnywhere(file: KrsFile, from: string, to: string): boolean {
  const systems = withUnassignedSystem(file);
  return allViewPaths(systems).some((path) => {
    const result = layout(extractView(systems, path));
    if (result.edges.some((e) => e.from === from && e.to === to)) return true;
    // The entity view is a second, parallel extraction — `extractView` returns
    // the empty slice for a path that resolves to entities, so a table that
    // only drove `extractView` could never see an `entity` relation at all and
    // the `entity` third of the origin-scope rule would sit outside it (#2501).
    const entityView = extractEntityView(systems, path);
    return [...entityView.childEdges, ...entityView.ghostEntityEdges].some(
      (e) => e.from === from && e.to === to,
    );
  });
}

/** Does the block named `blockId` declare exactly this edge? */
function blockHoldsEdge(file: KrsFile, blockId: string, from: string, to: string): boolean {
  const roots = [...file.systems, ...file.services, ...file.domains, ...file.clients];
  const walk = (node: KrsNode): boolean =>
    (node.id === blockId && node.edges.some((e) => e.from === from && e.to === to)) ||
    node.children.some(walk);
  return roots.some(walk);
}

/**
 * Is the edge reported anywhere? "Reported" spans **every register and every
 * stage**, not just the resolver: a source-mismatched declaration is rejected
 * by the parser (`edge-source-mismatch`, an error), and that is the whole
 * signal the author gets once the view side stops drawing it (#2501). Counting
 * only `analyze()` here is what let a rendered-*and*-errored edge sit in this
 * table looking fine.
 */
function isReported(parsed: ParseResult<KrsFile>, placement: Placement): boolean {
  const [from, to] = placement.edge;
  // Pinned to the whole pair, not just the source: the diagnostic only names
  // `from` and the block it was rejected in, so two mismatched declarations
  // sharing a source would otherwise let the first one's error credit the
  // second. Confirming that block actually holds this pair closes that.
  const mismatched = parsed.diagnostics.some(
    (d) =>
      d.code === "edge-source-mismatch" &&
      d.params.from === from &&
      blockHoldsEdge(parsed.value, d.params.parentId, from, to),
  );
  const notAtScope = analyze(parsed.value, []).some(
    (w) => w.kind === "edge-endpoint-not-at-scope" && w.params.endpointId === placement.endpoint,
  );
  return mismatched || notAtScope;
}

interface Placement {
  name: string;
  krs: string;
  /** The edge under test, as declared. */
  edge: [from: string, to: string];
  /** The endpoint the diagnostic would name when the edge cannot be drawn. */
  endpoint: string;
  outcome: "renders" | "reported";
}

const PLACEMENTS: Placement[] = [
  {
    name: "service-anchored edge to a sibling service",
    krs: `
system T {
  service S1 { S1 -> S2
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
}
`,
    edge: ["S1", "S2"],
    endpoint: "S2",
    outcome: "renders",
  },
  {
    name: "service-anchored edge to an external sibling service",
    krs: `
system T {
  service S1 { S1 -> Pay
    domain A { usecase u {} }
  }
  service Pay [external] {}
}
`,
    edge: ["S1", "Pay"],
    endpoint: "Pay",
    outcome: "renders",
  },
  {
    name: "service-anchored edge to a sibling client",
    krs: `
system T {
  service S1 { S1 -> W
    domain A { usecase u {} }
  }
  client W [web]
}
`,
    edge: ["S1", "W"],
    endpoint: "W",
    outcome: "renders",
  },
  {
    name: "service-anchored edge to another service's domain",
    krs: `
system T {
  service S1 { S1 -> B
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
}
`,
    edge: ["S1", "B"],
    endpoint: "B",
    outcome: "reported",
  },
  {
    name: "domain-anchored edge to a sibling domain",
    krs: `
system T {
  service S1 {
    domain A { A -> B
      usecase u {}
    }
    domain B { usecase v {} }
  }
}
`,
    edge: ["A", "B"],
    endpoint: "B",
    outcome: "renders",
  },
  {
    name: "domain-anchored edge to a client one scope up",
    krs: `
system T {
  service S1 {
    domain A { A -> W
      usecase u {}
    }
  }
  client W [web]
}
`,
    edge: ["A", "W"],
    endpoint: "W",
    outcome: "reported",
  },
  {
    name: "system-scope edge to a domain nested in a service",
    krs: `
system T {
  service S1 {
    domain A { usecase u {} }
    domain B { usecase v {} }
  }
  A -> B
}
`,
    edge: ["A", "B"],
    endpoint: "B",
    outcome: "reported",
  },
  {
    name: "service-anchored edge between two orphan services",
    krs: `
service S1 { S1 -> S2
  domain A { usecase u {} }
}
service S2 { domain B { usecase v {} } }
`,
    edge: ["S1", "S2"],
    endpoint: "S2",
    outcome: "renders",
  },
  {
    name: "service-anchored edge on a multi-system root",
    krs: `
system T {
  service S1 { S1 -> S2
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
}
system U {
  service S3 { domain C { usecase w {} } }
}
`,
    edge: ["S1", "S2"],
    endpoint: "S2",
    outcome: "renders",
  },
  {
    // The origin-scope rule forbids naming another service as the source, so
    // the parser has already rejected this with an error. Drawing it anyway
    // would give one relation a second spelling (#2501).
    name: "service-anchored edge whose source is a sibling service",
    krs: `
system T {
  service S1 { S2 -> S3 "leaked"
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
  service S3 { domain C { usecase w {} } }
}
`,
    edge: ["S2", "S3"],
    endpoint: "S3",
    outcome: "reported",
  },
  {
    // The same rule one scope down. This half predates #2223: the intra-service
    // domain pass never checked the source either (#2501).
    name: "domain-anchored edge whose source is a sibling domain",
    krs: `
system T {
  service S1 {
    domain A { usecase u {} }
    domain B { usecase v {} }
    domain C { A -> B
      usecase w {}
    }
  }
}
`,
    edge: ["A", "B"],
    endpoint: "B",
    outcome: "reported",
  },
  {
    // A `client` block carries **no** origin-scope rule — the parser accepts a
    // foreign source there without a diagnostic — so the source guard must not
    // reach it, or the edge would drop with no signal at all (#2501).
    name: "edge anchored in a client block, sourced at a sibling service",
    krs: `
system T {
  client W [web] {
    S1 -> S2
  }
  service S1 { domain A { usecase u {} } }
  service S2 { domain B { usecase v {} } }
}
`,
    edge: ["S1", "S2"],
    endpoint: "S2",
    outcome: "renders",
  },
  {
    // Infra blocks are parsed by a different branch than `client` bodies, so
    // "the guard stops at the kinds that carry the rule" is not transitive
    // from the client row (#2501).
    name: "edge anchored in a database block, sourced at a sibling service",
    krs: `
system T {
  database D {
    S1 -> S2
    table t
  }
  service S1 { domain A { usecase u {} } }
  service S2 { domain B { usecase v {} } }
}
`,
    edge: ["S1", "S2"],
    endpoint: "S2",
    outcome: "renders",
  },
  {
    // The canonical entity relation: origin = the reference holder.
    name: "entity relation anchored at the reference-holding entity",
    krs: `
system T {
  service S {
    domain D {
      entity A { A -> B }
      entity B {}
    }
  }
}
`,
    edge: ["A", "B"],
    endpoint: "B",
    outcome: "renders",
  },
  {
    // On an `entity` the origin-scope rule *is* the direction rule, so a
    // mismatched source does not merely misplace the relation — it names the
    // wrong end of it (#2501).
    name: "entity relation whose source is the other entity",
    krs: `
system T {
  service S {
    domain D {
      entity A { B -> A }
      entity B {}
    }
  }
}
`,
    edge: ["B", "A"],
    endpoint: "A",
    outcome: "reported",
  },
  {
    // The qualified cross-domain spelling, where the ghost branch would
    // otherwise restate the relation as `A -> D2.C` and fabricate a source.
    name: "cross-domain entity relation whose source is neither entity",
    krs: `
system T {
  service S {
    domain D { entity A { Z -> D2.C } }
    domain D2 { entity C {} }
  }
}
`,
    edge: ["Z", "D2.C"],
    endpoint: "D2.C",
    outcome: "reported",
  },
  {
    // A top-level `client` is not wrapped into the `__unassigned__` frame, so
    // it shares a canvas with nothing — the edge has nowhere to draw.
    name: "edge anchored in a top-level client",
    krs: `
client W [web] {
  W -> S1
}
service S1 { domain A { usecase u {} } }
`,
    edge: ["W", "S1"],
    endpoint: "S1",
    outcome: "reported",
  },
];

/**
 * The root canvas has three shapes, and only one of them lays out from
 * `ViewSlice.childEdges`: a single real system. The multi-system root and the
 * `__unassigned__`-only root go through `layoutMultipleSystems`, which reads
 * each system's own edge list — so an anchored edge that survives extraction
 * can still be dropped there. Asserting on the *rendered* root of all three is
 * what keeps that gap closed (#2223).
 */
describe("the root canvas draws a service-anchored edge in every root shape", () => {
  const rootEdges = (krs: string): string[] => {
    const systems = withUnassignedSystem(Parser.parse(krs).value);
    return layout(extractView(systems, [])).edges.map((e) => `${e.from}->${e.to}`);
  };

  it("single-system root", () => {
    expect(
      rootEdges(`
system T {
  service S1 { S1 -> S2
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
}
`),
    ).toContain("S1->S2");
  });

  it("multi-system root", () => {
    expect(
      rootEdges(`
system T {
  service S1 { S1 -> S2
    domain A { usecase u {} }
  }
  service S2 { domain B { usecase v {} } }
}
system U {
  service S3 { domain C { usecase w {} } }
}
`),
    ).toContain("S1->S2");
  });

  it("unassigned-only root", () => {
    expect(
      rootEdges(`
service S1 { S1 -> S2
  domain A { usecase u {} }
}
service S2 { domain B { usecase v {} } }
`),
    ).toContain("S1->S2");
  });
});

describe("an authored edge either renders or is reported (TPL-2075)", () => {
  for (const placement of PLACEMENTS) {
    it(`${placement.name} — ${placement.outcome}`, () => {
      const parsed = Parser.parse(placement.krs);
      const [from, to] = placement.edge;
      const renders = rendersAnywhere(parsed.value, from, to);
      const reported = isReported(parsed, placement);

      expect({ renders, reported }).toEqual({
        renders: placement.outcome === "renders",
        reported: placement.outcome === "reported",
      });
    });
  }
});
