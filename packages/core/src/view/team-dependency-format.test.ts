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

  it("says a model with no organization has no matrix, without going silent", () => {
    const none = extractTeamDependencies(Parser.parse(`system S { service A {} }`).value);
    const noOrgMd = formatTeamDependenciesAsMarkdown(none);
    expect(noOrgMd).toContain("_(no organization declared)_");
    // No matrix to draw, but the sections that report what the join covered
    // still run — see `still reports the unowned remainder…` below.
    expect(noOrgMd).not.toContain("| from \\ to |");
    expect(noOrgMd).toContain("## Unowned endpoints");
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

describe("markdown / csv robustness", () => {
  it("escapes a `|` in a label so the table keeps its column count", () => {
    const piped = extractTeamDependencies(
      Parser.parse(`
system S {
  service A { domain Da { Da -> Db "a | b" } }
  service B { domain Db {} }
}
organization O { team ta { label "Alpha | Beta" owns A } team tb { owns B } }
`).value,
    );
    const md = formatTeamDependenciesAsMarkdown(piped);
    const rows = md.split("\n").filter((l) => l.startsWith("|"));
    // Drop escaped pipes, then count the real column separators.
    const columns = rows.map((r) => r.split("\\|").join("").split("|").length);
    // Header, separator and body row of the matrix all declare 3 columns.
    expect(columns.slice(0, 3)).toEqual([columns[0], columns[0], columns[0]]);
    expect(md).toContain("Alpha \\| Beta");
  });

  it("still reports the unowned remainder when the model declares no organization", () => {
    // The default surface must not be silent about a join that covered
    // nothing while the csv projection reports it.
    const noOrg = extractTeamDependencies(
      Parser.parse(`system S { service A {} service B {} A -> B }`).value,
    );
    const md = formatTeamDependenciesAsMarkdown(noOrg);
    expect(md).toContain("_(no organization declared)_");
    expect(md).toContain("## Unowned endpoints");
    expect(md).toContain("| S.A | service |");
  });
});

describe("structural overlap projections (#2637)", () => {
  const OVERLAP = extractTeamDependencies(
    Parser.parse(`
system Shop {
  service Checkout { domain Pricing {} }
  service Payments {}
}
organization Shop {
  team checkout { label "Checkout Team" owns Checkout }
  team payments { label "Payments Team" owns Payments owns Pricing }
}
`).value,
  );

  it("gets its own markdown section, not a row among the dependencies", () => {
    const md = formatTeamDependenciesAsMarkdown(OVERLAP);
    expect(md).toContain("## Structural overlap");
    expect(md).toContain(
      "| Shop.Checkout.Pricing | Payments Team | Shop.Checkout | Checkout Team |",
    );
    // A containment fact must not be counted as an edge-induced dependency.
    expect(md).toContain("_(no team dependencies derived)_");
  });

  it("says so in markdown when no ownership crosses containment", () => {
    const flat = extractTeamDependencies(
      Parser.parse(`system S { service A {} }\norganization O { team t { owns A } }`).value,
    );
    expect(formatTeamDependenciesAsMarkdown(flat)).toContain(
      "_(no ownership crosses containment)_",
    );
  });

  it("is a csv row discriminated by its own relation value", () => {
    const rows = formatTeamDependenciesAsCsv(OVERLAP).trim().split("\n");
    expect(
      rows.some((r) =>
        r.startsWith("structural-overlap,payments,checkout,,Shop.Checkout.Pricing,domain,,"),
      ),
    ).toBe(true);
  });
});
