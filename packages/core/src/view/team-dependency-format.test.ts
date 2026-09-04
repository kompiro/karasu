import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractTeamDependencies } from "./team-dependency-extract.js";
import {
  formatTeamDependenciesAsCsv,
  formatTeamDependenciesAsMarkdown,
} from "./team-dependency-format.js";

const MODEL = `
system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "Authorize card"
      Cart --> Picking "Reserve stock"
    }
  }
  service Payments {
    domain Authorization { Authorization -> Settlement "post entry" }
    domain Settlement {}
  }
  service Fulfillment {
    domain Picking {}
    domain Shipping { Shipping -> Settlement "Settle" }
  }
  service Platform {}

  Checkout -> Platform "Read config"
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

const report = extractTeamDependencies(Parser.parse(MODEL).value);

describe("formatTeamDependenciesAsMarkdown", () => {
  const md = formatTeamDependenciesAsMarkdown(report);

  it("draws a team x team matrix whose marks are the .krs arrows", () => {
    expect(md).toContain(
      "| from \\ to | Checkout Team | Payments Team | PCI WG | Fulfillment Team |",
    );
    // Checkout depends on Payments synchronously and on Fulfillment asynchronously.
    expect(md).toContain("| Checkout Team | — | -> |  | --> |");
  });

  it("parenthesizes a nested pair so it reads as present but not cross-team", () => {
    // `pci` is a sub-team of `payments`, so an edge between their holdings is
    // real but not a path across the org.
    const nestedRow = md.split("\n").find((l) => l.startsWith("| Payments Team |"))!;
    expect(nestedRow).toContain("(->)");
  });

  it("carries provenance, with `~` on endpoints whose team was inherited", () => {
    expect(md).toContain("## Dependencies");
    expect(md).toContain(
      '| Checkout Team | Payments Team | sync | cross-team | 1 | Shop.Checkout.Cart~ -> Shop.Payments.Authorization~ "Authorize card" |',
    );
  });

  it("lists the unowned remainder rather than presenting a partial join as complete", () => {
    expect(md).toContain("## Unowned endpoints");
    expect(md).toContain("| Shop.Platform | service |");
    expect(md).toContain("endpoint(s) name a node no team owns");
  });

  it("says so when nothing was derived, instead of printing an empty table", () => {
    const none = extractTeamDependencies(
      Parser.parse(`system S { service A {} }\norganization O { team t { owns A } }`).value,
    );
    expect(formatTeamDependenciesAsMarkdown(none)).toContain("_(no team dependencies derived)_");
    expect(formatTeamDependenciesAsMarkdown(none)).toContain(
      "_(every endpoint resolved to a team)_",
    );
  });

  it("says a model with no organization has nothing to project", () => {
    const none = extractTeamDependencies(Parser.parse(`system S { service A {} }`).value);
    expect(formatTeamDependenciesAsMarkdown(none)).toBe("_(no organization declared)_\n");
  });
});

describe("formatTeamDependenciesAsCsv", () => {
  const csv = formatTeamDependenciesAsCsv(report);
  const rows = csv.trim().split("\n");

  it("is tidy data: one row per fact, discriminated by `relation`", () => {
    expect(rows[0]).toBe("relation,from_team,to_team,edge_kind,node,node_kind,edges,via");
    expect(rows).toContain(
      `cross-team,checkout,payments,sync,,,1,"Shop.Checkout.Cart~ -> Shop.Payments.Authorization~ ""Authorize card"""`,
    );
  });

  it("carries the nested pair with its own relation value rather than dropping it", () => {
    expect(rows.some((r) => r.startsWith("nested,payments,pci,sync,"))).toBe(true);
  });

  it("carries unowned endpoints in the same table so one pass reads both facts", () => {
    expect(rows.some((r) => r.startsWith("unowned,,,,Shop.Platform,service,"))).toBe(true);
  });

  it("quotes a field containing a comma", () => {
    const withComma = extractTeamDependencies(
      Parser.parse(`
system S {
  service A { domain Da { Da -> Db "read, then write" } }
  service B { domain Db {} }
}
organization O { team ta { owns A } team tb { owns B } }
`).value,
    );
    expect(formatTeamDependenciesAsCsv(withComma)).toContain(
      '"S.A.Da~ -> S.B.Db~ ""read, then write"""',
    );
  });
});
