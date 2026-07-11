import { describe, it, expect } from "vitest";
import { compileSystemDiff, InMemoryFileSystemProvider } from "../index.js";

// Two teams (payments owns Billing/Wallet, catalog owns Search/Catalog).
// The after-slice adds a Reporting service owned by payments — so the diff
// carries an "added" node inside a team frame.
const ORG = `
organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
    owns Reporting
  }
  team "catalog" {
    label "Catalog"
    owns Search
    owns Catalog
  }
}
`;

const BEFORE = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }

  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Catalog "reserve"
}
${ORG}`;

const AFTER = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }
  service Reporting { label "Reporting" }

  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Catalog "reserve"
  Reporting -> Billing "aggregate"
  Catalog -> Wallet "sync"
}
${ORG}`;

const BEFORE_PATH = "/project/before.krs";
const AFTER_PATH = "/project/after.krs";

async function diffSvg(groupBy?: "team", collapsedGroups?: ReadonlySet<string>): Promise<string> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile(BEFORE_PATH, BEFORE);
  await fs.writeFile(AFTER_PATH, AFTER);
  const result = await compileSystemDiff({
    beforeEntryPath: BEFORE_PATH,
    afterEntryPath: AFTER_PATH,
    fs,
    groupBy,
    collapsedGroups,
    interactive: true,
  });
  return result.svg;
}

describe("compileSystemDiff() with groupBy: team (#1873 Gap 1)", () => {
  it("does not draw frames when groupBy is omitted (opt-in; no regression)", async () => {
    const svg = await diffSvg(undefined);
    expect(svg).not.toContain('data-group="true"');
    // The added node is still present in the ungrouped diff.
    expect(svg).toContain('data-node-id="Reporting"');
  });

  it("draws one boundary frame per team in diff mode", async () => {
    const svg = await diffSvg("team");
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
    expect(svg.match(/data-group="true"/g)?.length).toBe(2);
  });

  it("keeps the diff state on grouped nodes (added node stays framed)", async () => {
    const svg = await diffSvg("team");
    // Reporting is added AND owned by payments — it must render inside the
    // grouped diff, not be dropped by the group layout.
    expect(svg.match(/data-node-id="Reporting"/g)?.length).toBe(1);
    for (const id of ["Billing", "Wallet", "Search", "Catalog"]) {
      expect(svg.match(new RegExp(`data-node-id="${id}"`, "g"))?.length).toBe(1);
    }
    // Grouping must not strip the diff decoration the feature exists to show:
    // the framed Reporting node still carries data-diff-state="added".
    expect(svg).toMatch(/data-node-id="Reporting"[^>]*data-diff-state="added"/);
  });

  it("collapses a team to a stub and re-targets its cross-group edges in diff mode", async () => {
    const svg = await diffSvg("team", new Set(["payments"]));
    expect(svg).not.toContain('data-node-id="Billing"');
    expect(svg).toContain('data-node-id="__group_collapsed_payments__"');
    expect(svg).toContain('data-node-id="Search"');
    // The cross-group edge Billing -> Catalog is RE-TARGETED to the stub, not
    // dropped (unlike category collapse). Its head stays on Catalog.
    expect(svg).toMatch(/data-edge-from="__group_collapsed_payments__"[^>]*data-edge-to="Catalog"/);
    // The added cross-group edge Catalog -> Wallet is likewise re-pointed at the
    // stub (Wallet folds in), not dropped. Whether an aggregated stub edge should
    // carry the original per-edge diff state is a diff+grouping design question
    // deferred to follow-up #1886; here we only fence that the edge survives.
    expect(svg).toMatch(/data-edge-from="Catalog"[^>]*data-edge-to="__group_collapsed_payments__"/);
  });

  // A node REMOVED in the after-slice but owned (in the before-slice) by a team.
  // compileSystemDiff only has the after-side ownerIndex, so such a node cannot
  // resolve its former team and lands in the trailing un-grouped band rather than
  // inside its team frame. That placement is a documented limitation (follow-up
  // #1886); this test fences the guarantee that DOES hold today — TPL-20260624-02
  // totality: the removed node is still rendered exactly once with its diff
  // state, never dropped by the group layout.
  it("still renders a removed team-owned node exactly once in diff mode (totality)", async () => {
    const withLegacyOrg = `
organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Legacy
  }
  team "catalog" {
    label "Catalog"
    owns Search
  }
}`;
    const before = `system Shop {
  service Billing { label "Billing" }
  service Legacy { label "Legacy" }
  service Search { label "Search" }
  Legacy -> Billing "migrate"
}${withLegacyOrg}`;
    const after = `system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "catalog" { label "Catalog" owns Search }
}`;

    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(BEFORE_PATH, before);
    await fs.writeFile(AFTER_PATH, after);
    const result = await compileSystemDiff({
      beforeEntryPath: BEFORE_PATH,
      afterEntryPath: AFTER_PATH,
      fs,
      groupBy: "team",
      interactive: true,
    });

    // The removed node survives the group layout and keeps its removed state.
    expect(result.svg.match(/data-node-id="Legacy"/g)?.length).toBe(1);
    expect(result.svg).toMatch(/data-node-id="Legacy"[^>]*data-diff-state="removed"/);
    // The surviving team is still framed.
    expect(result.svg).toContain('data-container-id="__group_payments__"');
  });

  // #1873 review: the diff preview passes `interactive: true`, which draws the
  // ⊖ category-collapse control on the external/infra band. That control must be
  // honoured (not a no-op) in compare mode — so compileSystemDiff forwards
  // `collapsedCategories` to the render pass just like the non-compare view.
  it("honours collapsedCategories in diff mode (category control is not a dead affordance)", async () => {
    const src = `system Shop {
  service Billing { label "Billing" }
  service Stripe [external] { label "Stripe" }
  Billing -> Stripe "pay"
}`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(BEFORE_PATH, src);
    await fs.writeFile(AFTER_PATH, src);
    const result = await compileSystemDiff({
      beforeEntryPath: BEFORE_PATH,
      afterEntryPath: AFTER_PATH,
      fs,
      collapsedCategories: new Set(["external"]),
      interactive: true,
    });
    // The external service folds into the category stub instead of rendering.
    expect(result.svg).toContain('data-node-id="__collapsed_external__"');
    expect(result.svg).not.toContain('data-node-id="Stripe"');
  });
});
