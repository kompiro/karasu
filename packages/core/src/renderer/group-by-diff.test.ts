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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** First `<rect>` following the element whose opening tag matches `open`. */
function rectAfter(svg: string, open: RegExp): Rect | null {
  const m = svg.match(open);
  if (!m || m.index === undefined) return null;
  const rect = svg.slice(m.index + m[0].length).match(/<rect\s[^>]*>/);
  if (!rect) return null;
  const num = (attr: string): number =>
    Number(rect[0].match(new RegExp(`${attr}="(-?[\\d.]+)"`))?.[1] ?? NaN);
  return { x: num("x"), y: num("y"), w: num("width"), h: num("height") };
}

/** The team boundary frame's rect. */
function groupFrameRect(svg: string, groupId: string): Rect | null {
  return rectAfter(svg, new RegExp(`<g data-container-id="__group_${groupId}__"[^>]*>`));
}

/** A rendered node's rect. */
function nodeRect(svg: string, nodeId: string): Rect | null {
  return rectAfter(svg, new RegExp(`<g[^>]*data-node-id="${nodeId}"[^>]*>`));
}

/** Whether the node's center sits inside the frame (i.e. it is framed by it). */
function centerInside(node: Rect, frame: Rect): boolean {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
}

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
  // Before #1886, compileSystemDiff passed only the after-side ownerIndex, so
  // such a node could not resolve its former team and landed in the trailing
  // un-grouped band. #1886 merges the before ∪ after ownerIndex (after wins), so
  // the removed node now resolves its former team and renders INSIDE that team's
  // frame. This fences both TPL-20260624-02 totality (rendered exactly once with
  // its removed state) AND the #1886 placement decision.
  it("places a removed team-owned node inside its former team frame in diff mode (#1886)", async () => {
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
    const svg = result.svg;

    // The removed node survives the group layout exactly once and keeps its state.
    expect(svg.match(/data-node-id="Legacy"/g)?.length).toBe(1);
    expect(svg).toMatch(/data-node-id="Legacy"[^>]*data-diff-state="removed"/);
    expect(svg).toContain('data-container-id="__group_payments__"');

    // #1886 placement: Legacy (owned by payments in the before-slice, removed in
    // after) is framed by its former team, not dropped to the trailing band.
    const frame = groupFrameRect(svg, "payments");
    const legacy = nodeRect(svg, "Legacy");
    expect(frame).not.toBeNull();
    expect(legacy).not.toBeNull();
    expect(centerInside(legacy!, frame!)).toBe(true);
    // Sanity: a catalog-owned node is NOT inside the payments frame.
    const search = nodeRect(svg, "Search");
    expect(centerInside(search!, frame!)).toBe(false);
  });

  // Decision 1 side effect: when a team disappears wholesale (declared before,
  // gone after), the merged ownerIndex still maps its before-side members to it,
  // so an all-removed team frame is drawn — "team X and all it owned was removed".
  it("draws an all-removed team frame when a team disappears wholesale (#1886)", async () => {
    const before = `system Shop {
  service Billing { label "Billing" }
  service Ledger { label "Ledger" }
  service Search { label "Search" }
}
organization Org {
  team "payments" { label "Payments" owns Billing owns Ledger }
  team "catalog" { label "Catalog" owns Search }
}`;
    // payments (and both its services) removed in after; catalog remains.
    const after = `system Shop {
  service Search { label "Search" }
}
organization Org {
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
    const svg = result.svg;

    // The removed team is still framed, and both its removed members are inside it.
    expect(svg).toContain('data-container-id="__group_payments__"');
    const frame = groupFrameRect(svg, "payments");
    for (const id of ["Billing", "Ledger"]) {
      expect(svg).toMatch(new RegExp(`data-node-id="${id}"[^>]*data-diff-state="removed"`));
      expect(centerInside(nodeRect(svg, id)!, frame!)).toBe(true);
    }
  });

  // Decision 2 (#1886): a collapsed team's re-targeted stub edge aggregates
  // one-or-more original cross-group edges — it must keep its diff decoration,
  // re-keyed onto the stub id (TPL-20260712-01). Single unambiguous state carries
  // through; a mix folds to `changed`.
  it("keeps single-state diff decoration on a collapsed team's stub edge (#1886)", async () => {
    // Catalog -> Wallet is an ADDED cross-group edge (catalog → payments). When
    // payments collapses it re-targets to `Catalog -> <stub>` and must stay added.
    const svg = await diffSvg("team", new Set(["payments"]));
    expect(svg).toMatch(
      /data-edge-from="Catalog"[^>]*data-edge-to="__group_collapsed_payments__"[^>]*data-diff-state="added"/,
    );
  });

  it("keeps `removed` diff decoration on a collapsed team's stub edge (#1886)", async () => {
    // A cross-group dependency deleted in `after` (state removed) must still show
    // its removed decoration once its target team folds — the mirror of the bug
    // #1886 fixes (retargeted edge losing its state), for the removed direction.
    const before = `system Shop {
  service Billing { label "Billing" }
  service Gateway { label "Gateway" }
  Gateway -> Billing "call"
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "edge" { label "Edge" owns Gateway }
}`;
    const after = `system Shop {
  service Billing { label "Billing" }
  service Gateway { label "Gateway" }
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "edge" { label "Edge" owns Gateway }
}`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(BEFORE_PATH, before);
    await fs.writeFile(AFTER_PATH, after);
    const result = await compileSystemDiff({
      beforeEntryPath: BEFORE_PATH,
      afterEntryPath: AFTER_PATH,
      fs,
      groupBy: "team",
      collapsedGroups: new Set(["payments"]),
      interactive: true,
    });
    expect(result.svg).toMatch(
      /data-edge-from="Gateway"[^>]*data-edge-to="__group_collapsed_payments__"[^>]*data-diff-state="removed"/,
    );
  });

  // Merge is backfill-off-removed, not a blind before ∪ after union: a node that
  // merely lost its `owns` (kept in `after`, now unowned) must NOT inherit its
  // stale before team — otherwise a leak would frame it / badge it under a team
  // the after state no longer assigns. This fences the after-authoritative rule.
  it("does not leak a former team onto a kept node whose ownership was removed (#1886)", async () => {
    const before = `system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "catalog" { label "Catalog" owns Search }
}`;
    // Billing survives but payments no longer owns it (owns line dropped).
    const after = `system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
}
organization Org {
  team "payments" { label "Payments" }
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
    const svg = result.svg;
    // payments no longer owns anything → no payments frame; Billing is not inside it.
    expect(svg).not.toContain('data-container-id="__group_payments__"');
    // Catalog still owns Search → its frame exists and does not contain Billing.
    const catalog = groupFrameRect(svg, "catalog");
    expect(catalog).not.toBeNull();
    expect(centerInside(nodeRect(svg, "Billing")!, catalog!)).toBe(false);
  });

  it("folds mixed-state cross-group edges to `changed` on the stub edge (#1886)", async () => {
    // Gateway -> Billing stays unchanged; Gateway -> Wallet is added. Both cross
    // into payments, so collapsing payments folds them onto one stub edge
    // `Gateway -> <stub>` whose state must be `changed` (mixed).
    const before = `system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Gateway { label "Gateway" }
  Gateway -> Billing "call"
}
organization Org {
  team "payments" { label "Payments" owns Billing owns Wallet }
  team "edge" { label "Edge" owns Gateway }
}`;
    const after = `system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Gateway { label "Gateway" }
  Gateway -> Billing "call"
  Gateway -> Wallet "call"
}
organization Org {
  team "payments" { label "Payments" owns Billing owns Wallet }
  team "edge" { label "Edge" owns Gateway }
}`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(BEFORE_PATH, before);
    await fs.writeFile(AFTER_PATH, after);
    const result = await compileSystemDiff({
      beforeEntryPath: BEFORE_PATH,
      afterEntryPath: AFTER_PATH,
      fs,
      groupBy: "team",
      collapsedGroups: new Set(["payments"]),
      interactive: true,
    });
    expect(result.svg).toMatch(
      /data-edge-from="Gateway"[^>]*data-edge-to="__group_collapsed_payments__"[^>]*data-diff-state="changed"/,
    );
  });

  // Kind-coarsening degenerate case (design § 差分モードの grouping): the diff
  // lookup is kind-less (`${from}->${to}`), so a sync + async stub-edge pair
  // between the same nodes shares one folded diff-state slot. Because the source
  // states come from the same kind-less key they agree by construction — both
  // stub edges must render with the same (added) decoration, not one bare.
  it("carries diff state on both kinds of a sync+async stub-edge pair (#1886)", async () => {
    const before = `system Shop {
  service Billing { label "Billing" }
  service Gateway { label "Gateway" }
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "edge" { label "Edge" owns Gateway }
}`;
    const after = `system Shop {
  service Billing { label "Billing" }
  service Gateway { label "Gateway" }
  Gateway -> Billing "sync"
  Gateway --> Billing "async"
}
organization Org {
  team "payments" { label "Payments" owns Billing }
  team "edge" { label "Edge" owns Gateway }
}`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(BEFORE_PATH, before);
    await fs.writeFile(AFTER_PATH, after);
    const result = await compileSystemDiff({
      beforeEntryPath: BEFORE_PATH,
      afterEntryPath: AFTER_PATH,
      fs,
      groupBy: "team",
      collapsedGroups: new Set(["payments"]),
      interactive: true,
    });
    const svg = result.svg;
    for (const kind of ["sync", "async"]) {
      expect(svg).toMatch(
        new RegExp(
          `data-edge-from="Gateway"[^>]*data-edge-to="__group_collapsed_payments__"[^>]*data-edge-kind="${kind}"[^>]*data-diff-state="added"`,
        ),
      );
    }
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
