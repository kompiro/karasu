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

describe("renderTeamDependencyGraph — layout under cycles and shared pairs", () => {
  function attr(svg: string, re: RegExp): string[] {
    return [...svg.matchAll(re)].map((m) => m[1]);
  }

  const MUTUAL = `
system S {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db { Db -> Da "call back" } }
}
organization O { team ta { owns A } team tb { owns B } }
`;

  it("puts the two teams of a cycle in different columns, with no blank leading column", () => {
    // A cap-based layering drives every member of a cycle to the same rightmost
    // layer, leaving the columns to its left empty but still charged for width.
    const svg = graphOf(MUTUAL);
    const xs = attr(svg, /<rect x="(\d+(?:\.\d+)?)" y="\d/g).map(Number);
    expect(new Set(xs).size).toBe(2);
    // The first column starts at the canvas padding: nothing empty to its left.
    expect(Math.min(...xs)).toBe(32);
  });

  it("routes the return edge of a cycle clear of the cards it would cross", () => {
    const svg = graphOf(MUTUAL);
    // Anchored on `<path d=` — a lazy `d="` also matches inside `data-edge-kind=`.
    const back = svg.match(/data-team-from="tb" data-team-to="ta"[\s\S]*?<path d="([^"]+)"/)?.[1];
    expect(back).toBeDefined();
    // It leaves and arrives on the card tops and arcs above them, so it never
    // runs underneath an opaque card fill (edges are painted before nodes).
    const nums = [...back!.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const ys = nums.filter((_, i) => i % 2 === 1);
    // Card tops sit at y = 32 (the canvas padding); the control points lift the
    // curve above that.
    expect(Math.min(...ys)).toBeLessThan(32);
    // And it starts on a card top rather than on a card side.
    expect(ys[0]).toBe(32);
  });

  it("fans sync and async apart when one team pair carries both", () => {
    // Drawn on one path the solid sync stroke hides the dashed async one, and
    // the distinction this view exists to show becomes invisible.
    const svg = graphOf(`
system S {
  service A { domain Da { Da -> Db "call"
    Da --> Db2 "event" } }
  service B { domain Db {} domain Db2 {} }
}
organization O { team ta { owns A } team tb { owns B } }
`);
    const paths = attr(svg, /data-team-from="ta" data-team-to="tb"[^>]*>\s*<path d="([^"]+)"/g);
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("gives the two directions of a mutual pair distinct count positions", () => {
    const svg = graphOf(`
system S {
  service A { domain Da { Da -> Db "one"
    Da -> Db2 "two" } }
  service B { domain Db { Db -> Da "back one" }
    domain Db2 { Db2 -> Da "back two" } }
}
organization O { team ta { owns A } team tb { owns B } }
`);
    const counts = [
      ...svg.matchAll(
        /data-team-from="(t[ab])" data-team-to="t[ab]"[\s\S]*?<text x="([^"]+)" y="([^"]+)"/g,
      ),
    ].map((m) => `${m[2]},${m[3]}`);
    expect(counts).toHaveLength(2);
    expect(counts[0]).not.toBe(counts[1]);
  });

  it("truncates a team label that would overflow its card", () => {
    const svg = graphOf(
      `system S { service A {} }\norganization O { team t { label "Platform Engineering Team" owns A } }`,
    );
    expect(svg).toContain("…");
    expect(svg).not.toContain("Platform Engineering Team<");
  });

  it("widens the canvas so a localized footer line is not clipped", () => {
    // Every model with no derived dependency puts all teams in one column, so
    // the grid is at its narrowest exactly when the footer is longest.
    const report = extractTeamDependencies(
      Parser.parse(
        `system S { service A {} service B {} A -> B }\norganization O { team t { owns A } }`,
      ).value,
    );
    const svg = renderTeamDependencyGraph(report, {
      emptyStateLabels: {
        teamDependencyUnowned: "所有チームに解決しなかった端点が {count} 件あります",
      },
    });
    const width = Number(svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) /)?.[1]);
    const footer =
      [...svg.matchAll(/font-size="11">([^<]+)</g)]
        .map((m) => m[1])
        .find((l) => l.includes("端点")) ?? "";
    expect(footer).toContain("端点");
    // 11px CJK runs ~9.5px per glyph; the line must fit inside the canvas.
    expect(width).toBeGreaterThan(footer.length * 9);  });
});

describe("renderTeamDependencyGraph — structural overlap (#2637)", () => {
  it("counts ownership crossing containment in the footer", () => {
    // No edge crosses a containment boundary, so there is no line on this
    // canvas that could carry it; a silent graph would hide the stronger of
    // the two signals.
    const svg = graphOf(`
system Shop {
  service Checkout { domain Pricing {} }
  service Payments {}
}
organization Shop {
  team checkout { owns Checkout }
  team payments { owns Payments owns Pricing }
}
`);
    expect(svg).toContain("1 node(s) owned across a containment boundary");
  });

  it("says nothing about overlap when none crosses", () => {
    const flat = graphOf(`
system S {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db {} }
}
organization O { team ta { owns A } team tb { owns B } }
`);
    expect(flat).not.toContain("owned across a containment boundary");  });
});

describe("renderTeamDependencyGraph — every curve stays on the canvas and off the cards", () => {
  // The shape of `examples/en/feature-samples/team-ownership.krs`: three teams
  // where one dependency skips a column and another closes a cycle.
  const SKIP_AND_CYCLE = `
system Marketplace {
  service Checkout {}
  service Billing {}
  service Search {}
  service Inventory {}
  service Gateway {}
  service Notifications {}
  database OrderDB {}

  Gateway -> Search "route"
  Gateway -> Checkout "route"
  Checkout -> Inventory "reserve"
  Checkout -> OrderDB "persist"
  Checkout --> Notifications "order placed"
}
organization MarketplaceOrg {
  team "payments" { label "Payments" owns Checkout owns Billing }
  team "catalog" { label "Catalog" owns Search owns Inventory }
  team "platform" { label "Platform" owns Gateway owns Notifications }
}
`;

  function curves(svg: string): { from: string; to: string; points: number[][] }[] {
    return [
      ...svg.matchAll(
        /data-team-from="([^"]+)" data-team-to="([^"]+)"[\s\S]*?<path d="M ([^"]+)"/g,
      ),
    ].map((m) => {
      const nums = [...m[3].matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
      const points: number[][] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
      return { from: m[1], to: m[2], points };
    });
  }

  it("keeps every control point inside the viewBox", () => {
    // A detour leaves the node grid, so a viewBox sized on the cards alone
    // clips it — the reader is left with two dangling fragments and no way to
    // tell which teams they joined.
    const svg = graphOf(SKIP_AND_CYCLE);
    const [vx, vy, vw, vh] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "").split(" ").map(Number);
    expect(vw).toBeGreaterThan(0);
    for (const c of curves(svg)) {
      for (const [x, y] of c.points) {
        expect(x).toBeGreaterThanOrEqual(vx);
        expect(x).toBeLessThanOrEqual(vx + vw);
        expect(y).toBeGreaterThanOrEqual(vy);
        expect(y).toBeLessThanOrEqual(vy + vh);
      }
    }
  });

  it("routes a dependency that skips a column clear of the card in between", () => {
    // Straight across, the line runs under an opaque card painted after it, so
    // that stretch is invisible and one long dependency reads as two short
    // arrows between the wrong teams.
    const svg = graphOf(SKIP_AND_CYCLE);
    const skip = curves(svg).find((c) => c.from === "payments" && c.to === "catalog");
    expect(skip).toBeDefined();
    const cardTop = 32;
    const cardBottom = 32 + 52;
    // It leaves and arrives on the card bottoms and dips below the row.
    expect(skip!.points[0][1]).toBe(cardBottom);
    expect(Math.max(...skip!.points.map(([, y]) => y))).toBeGreaterThan(cardBottom);
    expect(Math.min(...skip!.points.map(([, y]) => y))).toBeGreaterThanOrEqual(cardTop);
  });

  it("sends the skip-level and the back edge to opposite sides of the row", () => {
    const svg = graphOf(SKIP_AND_CYCLE);
    const found = curves(svg);
    const skip = found.find((c) => c.from === "payments" && c.to === "catalog")!;
    const back = found.find((c) => c.from === "platform" && c.to === "payments")!;
    expect(Math.max(...skip.points.map(([, y]) => y))).toBeGreaterThan(84);
    expect(Math.min(...back.points.map(([, y]) => y))).toBeLessThan(32);
  });

  it("keeps the footer below every routed curve", () => {
    const svg = graphOf(SKIP_AND_CYCLE);
    const footerY = Number(svg.match(/<text x="\d+" y="(\d+(?:\.\d+)?)"[^>]*font-size="11"/)?.[1]);
    const lowest = Math.max(...curves(svg).flatMap((c) => c.points.map(([, y]) => y)));
    expect(footerY).toBeGreaterThan(lowest);
  });
});
