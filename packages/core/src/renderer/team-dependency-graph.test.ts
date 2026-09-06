import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractTeamDependencies } from "../view/team-dependency-extract.js";
import { renderTeamDependencyGraph } from "./team-dependency-graph.js";

function graphOf(source: string): string {
  return renderTeamDependencyGraph(extractTeamDependencies(Parser.parse(source).value));
}

const MODEL = `
system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "authorize"
      Cart --> Picking "reserve"
    }
  }
  service Payments {
    domain Authorization { Authorization -> Settlement "post" }
    domain Settlement {}
  }
  service Fulfillment { domain Picking {} }
  service Platform {}

  Checkout -> Platform "config"
}

organization Shop {
  team checkout { label "Checkout Team" owns Checkout }
  team payments {
    label "Payments Team"
    owns Payments
    team pci { label "PCI WG" owns Settlement }
  }
  team fulfillment { label "Fulfillment Team" owns Fulfillment }
}
`;

describe("renderTeamDependencyGraph", () => {
  const svg = graphOf(MODEL);

  it("draws one node per declared team, including teams no dependency reaches", () => {
    for (const id of ["checkout", "payments", "pci", "fulfillment"]) {
      expect(svg).toContain(`data-team-node="${id}"`);
    }
    expect(svg).toContain("Checkout Team");
    expect(svg).toContain("PCI WG");
  });

  it("keeps sync and async visually distinct — solid line versus dashed", () => {
    const sync = svg.match(
      /<g data-team-from="checkout" data-team-to="payments"[^>]*>\s*<path[^>]*\/>/,
    )?.[0];
    const async = svg.match(
      /<g data-team-from="checkout" data-team-to="fulfillment"[^>]*>\s*<path[^>]*\/>/,
    )?.[0];
    expect(sync).toBeDefined();
    expect(async).toBeDefined();
    expect(sync).not.toContain("stroke-dasharray");
    expect(async).toContain('stroke-dasharray="6 4"');
  });

  it("carries the edge kind and relation as data attributes", () => {
    expect(svg).toContain('data-edge-kind="async"');
    expect(svg).toContain('data-relation="cross-team"');
    expect(svg).toContain('data-relation="nested"');
  });

  it("shows the unowned remainder in the footer rather than omitting it", () => {
    // `Platform` is owned by nobody; a graph that dropped it would present a
    // partial join as the whole model.
    expect(svg).toContain("1 endpoint(s) owned by no team");
  });

  it("says so when the org declares teams but no dependency was derived", () => {
    const noDeps = graphOf(`system S { service A {} }\norganization O { team t { owns A } }`);
    expect(noDeps).toContain("No team dependencies derived");
    expect(noDeps).toContain('data-team-node="t"');
  });

  it("renders the empty state when the model declares no organization", () => {
    const noOrg = graphOf(`system S { service A {} service B {} A -> B }`);
    expect(noOrg).toContain("No teams defined");
    expect(noOrg).not.toContain("data-team-node");
  });

  it("draws both directions of a mutual dependency instead of dropping one", () => {
    // Karasu observes cycles without judging them; the organizational
    // projection of one is a pair of teams that depend on each other.
    const mutual = graphOf(`
system S {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db { Db -> Da "call back" } }
}
organization O { team ta { owns A } team tb { owns B } }
`);
    expect(mutual).toContain('data-team-from="ta" data-team-to="tb"');
    expect(mutual).toContain('data-team-from="tb" data-team-to="ta"');
  });

  it("labels an aggregated pair with how many edges stand behind it", () => {
    const aggregated = graphOf(`
system S {
  service A {
    domain Da { Da -> Db "one"
      Da -> Dc "two" }
  }
  service B { domain Db {} domain Dc {} }
}
organization O { team ta { owns A } team tb { owns B } }
`);
    expect(aggregated).toMatch(/data-team-from="ta" data-team-to="tb"[\s\S]*?>2<\/text>/);
  });
});
