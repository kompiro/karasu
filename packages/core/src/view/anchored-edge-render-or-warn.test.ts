import { describe, it, expect } from "vitest";
import { extractView } from "./view-extract.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { layout } from "../renderer/layout.js";
import { Parser } from "../parser/parser.js";
import { analyze } from "../resolver/warnings.js";
import type { KrsFile, KrsNode } from "../types/ast.js";

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
    return result.edges.some((e) => e.from === from && e.to === to);
  });
}

function isReported(file: KrsFile, endpointId: string): boolean {
  return analyze(file, []).some(
    (w) => w.kind === "edge-endpoint-not-at-scope" && w.params.endpointId === endpointId,
  );
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
      const file = Parser.parse(placement.krs).value;
      const [from, to] = placement.edge;
      const renders = rendersAnywhere(file, from, to);
      const reported = isReported(file, placement.endpoint);

      expect({ renders, reported }).toEqual({
        renders: placement.outcome === "renders",
        reported: placement.outcome === "reported",
      });
    });
  }
});
