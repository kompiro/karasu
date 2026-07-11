import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// A system with two teams (payments owns Billing/Wallet, catalog owns
// Search/Catalog) plus an un-owned infra store and an [external] service.
const SYS = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }

  database ShopDB { label "Shop DB" }
  service Stripe [external] { label "Stripe" }

  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Catalog "reserve"
  Billing -> ShopDB "persist"
  Billing -> Stripe "authorize"
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
  }
  team "catalog" {
    label "Catalog"
    owns Search
    owns Catalog
  }
}
`;

function svgOf(groupBy?: "team"): string {
  const result = compile(SYS, { diagramType: "system", groupBy });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("compile() with groupBy: team", () => {
  it("does not change output when groupBy is omitted (opt-in; no regression)", () => {
    // Byte-for-byte identical to not passing the option at all — the grouped
    // path is inert until the viewer opts in.
    const withUndefined = svgOf(undefined);
    const withoutOption = (() => {
      const r = compile(SYS, { diagramType: "system" });
      if (r.diagramType !== "system") throw new Error("expected system view");
      return r.svg;
    })();
    expect(withUndefined).toBe(withoutOption);
    expect(withUndefined).not.toContain('data-group="true"');
  });

  it("draws one boundary frame per team when grouped", () => {
    const svg = svgOf("team");
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
    expect(svg.match(/data-group="true"/g)?.length).toBe(2);
  });

  it("still renders every node exactly once, grouped (TPL-20260624-02: totality)", () => {
    const svg = svgOf("team");
    for (const id of ["Billing", "Wallet", "Search", "Catalog", "ShopDB", "Stripe"]) {
      expect(svg.match(new RegExp(`data-node-id="${id}"`, "g"))?.length).toBe(1);
    }
  });

  it("leaves un-owned infra / external un-framed (they stay in the trailing band)", () => {
    const svg = svgOf("team");
    // No group frame is minted for a node that no team owns.
    expect(svg).not.toContain('data-container-id="__group_"');
    expect(svg).toContain('data-node-id="ShopDB"');
    expect(svg).toContain('data-node-id="Stripe"');
  });

  it("falls back to the ungrouped layout when the model has no owners", () => {
    const noOrg = `
system Shop {
  service A { label "A" }
  service B { label "B" }
  A -> B "x"
}
`;
    const grouped = compile(noOrg, { diagramType: "system", groupBy: "team" });
    const plain = compile(noOrg, { diagramType: "system" });
    if (grouped.diagramType !== "system" || plain.diagramType !== "system") {
      throw new Error("expected system view");
    }
    // No owners → no groups → identical to the default layout.
    expect(grouped.svg).toBe(plain.svg);
    expect(grouped.svg).not.toContain('data-group="true"');
  });
});
