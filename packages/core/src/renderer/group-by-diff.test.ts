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
  });

  it("collapses a team to a stub in diff mode too", async () => {
    const svg = await diffSvg("team", new Set(["payments"]));
    expect(svg).not.toContain('data-node-id="Billing"');
    expect(svg).toContain('data-node-id="__group_collapsed_payments__"');
    expect(svg).toContain('data-node-id="Search"');
  });
});
