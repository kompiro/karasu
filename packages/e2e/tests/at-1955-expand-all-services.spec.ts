import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";
import { nodeLocator } from "../fixtures/drill.js";

/**
 * AT-1955: the "Expand all" direction of the bulk toggle also expands every
 * drillable service in place, on a single-system, ungrouped view. The hook's
 * branches are unit-tested (`useSystemView.test.tsx`); this spec presses the
 * toolbar button and reads the re-rendered preview.
 *
 * Coverage map (test name → AT bullet):
 *  - "a pure-service model starts on Expand all and opens every service in one click" → AC-6 item 1
 *  - "a model with a database needs Collapse all, then Expand all" → AC-6 item 2
 *  - "under Group by: Team, Expand all opens the team frames but no service" → AC-6 item 3
 */

// Four drillable services: expanding all of them reaches the soft overload
// threshold (EXPANSION_OVERLOAD_THRESHOLD = 4 in useSystemView).
const SERVICES = `  service Orders { domain Cart {} }
  service Payments { domain Billing {} }
  service Shipping { domain Dispatch {} }
  service Catalog { domain Listing {} }

  Orders -> Payments "charges"
  Orders -> Shipping "ships"
  Catalog -> Orders "feeds"
`;
const DOMAINS = ["Cart", "Billing", "Dispatch", "Listing"];

const PURE_SERVICES = `system Shop {
${SERVICES}}
`;

// A store draws the infra band, which starts expanded.
const WITH_DATABASE = `system Shop {
${SERVICES}
  database OrderDB {}
  Orders -> OrderDB "persists"
}
`;

const WITH_TEAMS = `system Shop {
${SERVICES}}

organization Org {
  team "commerce" {
    owns Orders
    owns Payments
  }
  team "fulfilment" {
    owns Shipping
    owns Catalog
  }
}
`;

function overloadHint(page: Page) {
  return page.getByRole("status").filter({ hasText: "⚠" });
}

test.describe("AT-1955 Expand all services in place", () => {
  test("a pure-service model starts on Expand all and opens every service in one click (AC-6 item 1)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, PURE_SERVICES);

    // Nothing to fold, every service closed: the toggle starts on Expand all.
    const expandAll = page.getByRole("button", { name: "Expand all" });
    await expect(expandAll).toHaveAttribute("aria-pressed", "true");
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(0);

    await expandAll.click();
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(1);
    // The expanded frames keep their edges.
    await expect(
      page.locator('.preview-container svg [data-edge-from="Orders"][data-edge-to="Payments"]'),
    ).not.toHaveCount(0);
    await expect(overloadHint(page)).toBeVisible();

    const collapseAll = page.getByRole("button", { name: "Collapse all" });
    await expect(collapseAll).toHaveAttribute("aria-pressed", "false");
    await collapseAll.click();
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(0);
    await expect(overloadHint(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand all" })).toBeVisible();
  });

  test("a model with a database needs Collapse all, then Expand all (AC-6 item 2)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, WITH_DATABASE);

    // The infra band starts open, so the toggle starts on Collapse all.
    const collapseAll = page.getByRole("button", { name: "Collapse all" });
    await expect(collapseAll).toHaveAttribute("aria-pressed", "false");
    await expect(nodeLocator(page, "OrderDB")).toHaveCount(1);

    // First click only folds the band; no service opens.
    await collapseAll.click();
    await expect(nodeLocator(page, "OrderDB")).toHaveCount(0);
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(0);

    // Second click opens the band and every service.
    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(nodeLocator(page, "OrderDB")).toHaveCount(1);
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(1);
  });

  test("under Group by: Team, Expand all opens the team frames but no service (AC-6 item 3)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, WITH_TEAMS);
    await openViewTab(page, "System");
    await page.getByLabel("Group by").selectOption("team");

    const stubs = page.locator('.preview-container svg [data-node-id^="__group_collapsed_"]');
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(stubs).toHaveCount(2);

    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(stubs).toHaveCount(0);
    await expect(nodeLocator(page, "Orders")).toHaveCount(1);
    // The renderer emits no in-place expansion control under Group by, so no
    // service opens.
    await expect(page.locator(".preview-container svg [data-expand-node]")).toHaveCount(0);
    for (const domain of DOMAINS) await expect(nodeLocator(page, domain)).toHaveCount(0);
  });
});
