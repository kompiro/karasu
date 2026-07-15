import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// A system with two declared boundaries (payments contains Billing/Wallet,
// catalog contains Search/Catalog) and NO organization — so the boundary axis
// is the only grouping axis available. Mirrors group-by-render.test.ts (team).
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
}

boundary payments "Payments" {
  contains Billing
  contains Wallet
}
boundary catalog "Catalog" {
  contains Search
  contains Catalog
}
`;

function svgOf(groupBy?: "team" | "boundary", src = SYS): string {
  const result = compile(src, { diagramType: "system", groupBy });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("compile() with groupBy: boundary (#1822 P2b)", () => {
  it("is inert (byte-identical) when groupBy is omitted", () => {
    const withUndefined = svgOf(undefined);
    const withoutOption = (() => {
      const r = compile(SYS, { diagramType: "system" });
      if (r.diagramType !== "system") throw new Error("expected system view");
      return r.svg;
    })();
    expect(withUndefined).toBe(withoutOption);
    expect(withUndefined).not.toContain('data-container-id="__group_payments__"');
  });

  it("draws one boundary frame per declared boundary when grouped by boundary", () => {
    const svg = svgOf("boundary");
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
  });

  it("groups by the boundary axis, independent of team ownership", () => {
    // Same model but with an organization that owns the nodes into DIFFERENT
    // teams than the boundaries. Group by: boundary must still frame by
    // boundary, not by owning team.
    const withOrg = `${SYS}
organization Org {
  team "alpha" { owns Billing owns Search }
  team "beta" { owns Wallet owns Catalog }
}`;
    const svg = svgOf("boundary", withOrg);
    // Boundary frames present…
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
    // …and the team frames (alpha/beta) are NOT the grouping axis.
    expect(svg).not.toContain('data-container-id="__group_alpha__"');
    expect(svg).not.toContain('data-container-id="__group_beta__"');
  });

  it("team axis still uses ownership even when boundaries are declared", () => {
    const withOrg = `${SYS}
organization Org {
  team "alpha" { owns Billing owns Search }
  team "beta" { owns Wallet owns Catalog }
}`;
    const svg = svgOf("team", withOrg);
    expect(svg).toContain('data-container-id="__group_alpha__"');
    expect(svg).toContain('data-container-id="__group_beta__"');
    expect(svg).not.toContain('data-container-id="__group_payments__"');
  });

  it("degenerates to the ungrouped view when boundary axis has no boundaries", () => {
    const noBoundaries = `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}`;
    const grouped = svgOf("boundary", noBoundaries);
    const ungrouped = (() => {
      const r = compile(noBoundaries, { diagramType: "system" });
      if (r.diagramType !== "system") throw new Error("expected system view");
      return r.svg;
    })();
    // No boundaries → no frames, identical to ungrouped output.
    expect(grouped).toBe(ungrouped);
    expect(grouped).not.toContain('data-container-id="__group_');
  });
});
