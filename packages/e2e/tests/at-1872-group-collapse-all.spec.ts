import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";
import { nodeLocator } from "../fixtures/drill.js";

/**
 * AT-1872: "Collapse all / Expand all" in the system view under Group by: Team.
 * The hook's collapse logic and the button's contract are unit-tested
 * (`useSystemView.test.tsx`, `PreviewColumn.test.tsx`); this spec drives the
 * select, the bulk toggle and the per-team / per-category ⊖ through the live
 * preview.
 *
 * Coverage map (test name → AT bullet):
 *  - "Collapse all folds every team and both category bands; Expand all restores them" → AC-5 items 1-3
 *  - "after a per-team ⊖, Collapse all folds the rest" → AC-5 item 4
 *  - "after a per-category ⊖, Collapse all folds the rest" → AC-5 item 4
 *  - "Group by: None drops the team frames; the infra band keeps the toggle" → AC-5 item 5
 */

// `examples/en/feature-samples/team-ownership.krs`, which AC-5 names: three
// teams and an un-owned database in the trailing infra band. An external
// payment provider is added so the external band is exercised too.
const KRS = `system Marketplace {
  service Checkout { label "Checkout" }
  service Billing { label "Billing" }
  service Search { label "Search" }
  service Inventory { label "Inventory" }
  service Gateway { label "API Gateway" }
  service Notifications { label "Notifications" }
  database OrderDB { label "Order DB" }
  service PaymentProvider [external] { label "Payment Provider" }

  Gateway -> Search "route"
  Gateway -> Checkout "route"
  Checkout -> Billing "charge"
  Checkout -> Inventory "reserve"
  Search -> Inventory "read"
  Checkout -> OrderDB "persist"
  Checkout --> Notifications "order placed"
  Billing -> PaymentProvider "settles"
}

organization MarketplaceOrg {
  team "payments" {
    label "Payments"
    owns Checkout
    owns Billing
  }
  team "catalog" {
    label "Catalog"
    owns Search
    owns Inventory
  }
  team "platform" {
    label "Platform"
    owns Gateway
    owns Notifications
  }
}
`;

// Each category band and the node in it.
const CATEGORIES: Record<string, string> = {
  external: "PaymentProvider",
  infra: "OrderDB",
};

// Each team and one service it owns, to tell a folded team from an open one.
const TEAMS: Record<string, string> = {
  payments: "Checkout",
  catalog: "Search",
  platform: "Gateway",
};
const TEAM_COUNT = Object.keys(TEAMS).length;

function groupStubs(page: Page) {
  return page.locator('.preview-container svg [data-node-id^="__group_collapsed_"]');
}

function teamToggle(page: Page, team: string) {
  return page.locator(`.preview-container svg [data-collapse-group="${team}"]`);
}

function categoryToggle(page: Page, category: string) {
  return page.locator(`.preview-container svg [data-collapse-category="${category}"]`);
}

/**
 * The first key whose ⊖ sits inside the preview pane. The frames stack taller
 * than the pane, and the click is judged on mousedown/mouseup coordinates, so
 * the spec presses a control it can actually reach instead of naming one the
 * layout may have put out of view.
 */
async function firstReachable(
  page: Page,
  keys: readonly string[],
  toggle: (page: Page, key: string) => Locator,
): Promise<string> {
  const pane = await page.locator(".preview-container").boundingBox();
  if (!pane) throw new Error("preview pane is not laid out");
  for (const key of keys) {
    const box = await toggle(page, key).boundingBox();
    if (
      box &&
      box.x >= pane.x &&
      box.y >= pane.y &&
      box.x + box.width <= pane.x + pane.width &&
      box.y + box.height <= pane.y + pane.height
    ) {
      return key;
    }
  }
  throw new Error(`none of ${keys.join(", ")} has its ⊖ inside the preview pane`);
}

test.describe("AT-1872 Group by Team — Collapse all / Expand all", () => {
  test.beforeEach(async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    // Adding an organization can auto-switch to the Org tab; the toggle lives
    // on the System tab.
    await openViewTab(page, "System");
    await page.getByLabel("Group by").selectOption("team");
    for (const team of Object.keys(TEAMS)) await expect(teamToggle(page, team)).toHaveCount(1);
  });

  test("Collapse all folds every team and both category bands; Expand all restores them", async ({
    page,
  }) => {
    const collapseAll = page.getByRole("button", { name: "Collapse all" });
    await expect(collapseAll).toHaveAttribute("aria-pressed", "false");
    await expect(nodeLocator(page, "Checkout")).toHaveCount(1);
    for (const node of Object.values(CATEGORIES))
      await expect(nodeLocator(page, node)).toHaveCount(1);
    await expect(groupStubs(page)).toHaveCount(0);

    await collapseAll.click();
    // Every team becomes its `Team (N)` stub, and the external and infra bands
    // fold too.
    await expect(groupStubs(page)).toHaveCount(TEAM_COUNT);
    await expect(nodeLocator(page, "Checkout")).toHaveCount(0);
    for (const node of Object.values(CATEGORIES))
      await expect(nodeLocator(page, node)).toHaveCount(0);
    const expandAll = page.getByRole("button", { name: "Expand all" });
    await expect(expandAll).toHaveAttribute("aria-pressed", "true");
    await expect(expandAll).toHaveText("⊕ Expand all");

    await expandAll.click();
    await expect(groupStubs(page)).toHaveCount(0);
    await expect(nodeLocator(page, "Checkout")).toHaveCount(1);
    for (const node of Object.values(CATEGORIES))
      await expect(nodeLocator(page, node)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Collapse all" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("after a per-team ⊖, Collapse all folds the rest", async ({ page }) => {
    const folded = await firstReachable(page, Object.keys(TEAMS), teamToggle);
    const open = Object.keys(TEAMS).filter((team) => team !== folded);
    await teamToggle(page, folded).click();
    await expect(groupStubs(page)).toHaveCount(1);
    await expect(nodeLocator(page, TEAMS[folded])).toHaveCount(0);
    for (const team of open) await expect(nodeLocator(page, TEAMS[team])).toHaveCount(1);
    // Partly folded is not "all collapsed": the button still offers Collapse all.
    const collapseAll = page.getByRole("button", { name: "Collapse all" });
    await expect(collapseAll).toHaveAttribute("aria-pressed", "false");

    await collapseAll.click();
    await expect(groupStubs(page)).toHaveCount(TEAM_COUNT);
    for (const team of open) await expect(nodeLocator(page, TEAMS[team])).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand all" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  test.describe("per-category", () => {
    // The external and infra bands trail the three team frames, below the
    // default 720px pane; a taller viewport brings their ⊖ into reach.
    test.use({ viewport: { width: 1280, height: 2000 } });

    test("after a per-category ⊖, Collapse all folds the rest", async ({ page }) => {
      const folded = await firstReachable(page, Object.keys(CATEGORIES), categoryToggle);
      const open = Object.keys(CATEGORIES).filter((category) => category !== folded);
      await categoryToggle(page, folded).click();
      await expect(nodeLocator(page, CATEGORIES[folded])).toHaveCount(0);
      for (const category of open) {
        await expect(nodeLocator(page, CATEGORIES[category])).toHaveCount(1);
      }
      await expect(groupStubs(page)).toHaveCount(0);
      const collapseAll = page.getByRole("button", { name: "Collapse all" });
      await expect(collapseAll).toHaveAttribute("aria-pressed", "false");

      await collapseAll.click();
      await expect(groupStubs(page)).toHaveCount(TEAM_COUNT);
      for (const category of open) {
        await expect(nodeLocator(page, CATEGORIES[category])).toHaveCount(0);
      }
      await expect(page.getByRole("button", { name: "Expand all" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  test("Group by: None drops the team frames; the infra band keeps the toggle", async ({
    page,
  }) => {
    await page.getByLabel("Group by").selectOption("none");
    for (const team of Object.keys(TEAMS)) await expect(teamToggle(page, team)).toHaveCount(0);
    // Ungrouped, the database still sits in a foldable infra band, so the
    // bulk toggle stays (AC-3: shown whenever anything can fold).
    const collapseAll = page.getByRole("button", { name: "Collapse all" });
    await expect(collapseAll).toHaveAttribute("aria-pressed", "false");
    await collapseAll.click();
    await expect(nodeLocator(page, "OrderDB")).toHaveCount(0);
    await expect(groupStubs(page)).toHaveCount(0);
  });
});
