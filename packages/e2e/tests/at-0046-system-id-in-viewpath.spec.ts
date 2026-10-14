import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { drillInto } from "../fixtures/drill.js";

/**
 * AT-0046: System ID in ViewPath for multi-system navigation.
 *
 * Covers AC1 (single-system breadcrumb), AC2 (multi-system drill-down picks
 * the correct system), AC5 (a reload restores the drilled view from the hash)
 * and AC6 (browser back/forward walks the drill levels). AC3 is automated by
 * parser unit tests and AC4 is VS Code specific.
 *
 * AC5 and AC6 run in OPFS mode: memory-mode content is reseeded from the
 * built-in example on every boot, so a reload there would not prove the
 * drilled file survived. The hash also carries `?file=` in OPFS mode (#811),
 * so the assertions match the view token as a prefix.
 */

const DRILL_KRS = `system ECPlatform {
  service ECommerce {
    domain Ordering {
      usecase PlaceOrder {}
    }
  }
}
`;

/** The `#krs-<view>-<id>` token at the head of the hash, before `:` / `?file=`. */
const hashToken = (id: string) => new RegExp(`^#krs-system-${id}(?:[:?]|$)`);

const MULTI_SYSTEM_KRS = `system SysA {
  service ServiceA {
    domain DomainA {}
  }
}

system SysB {
  service ServiceB {
    domain DomainB {}
  }
}
`;

test.describe("AT-0046 System ID in ViewPath", () => {
  test("single-system breadcrumb includes the system label and restores root on click (AC1)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });

    await opfs.gotoApp();

    // Default Getting Started project is a single system `ECPlatform`
    // with an ECommerce service. Drill into it.
    await page.locator('svg [data-node-id="ECommerce"]').first().click();

    const breadcrumb = page.locator(".breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText(/ECPlatform|ECプラットフォーム|EC Platform/);
    await expect(breadcrumb).toContainText(/ECommerce|ECサイト|EC Site/);

    // Root link brings us back to the system view.
    await page
      .getByRole("button", { name: /^(ECPlatform|ECプラットフォーム|EC Platform)$/ })
      .first()
      .click();
    // After returning to root the drilled service is no longer the
    // "current" breadcrumb item.
    const current = page.locator(".breadcrumb-current");
    if ((await current.count()) > 0) {
      await expect(current).not.toContainText(/ECommerce|ECサイト|EC Site/);
    }
  });

  test("multi-system drill-down keeps the correct system in the breadcrumb (AC2)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, MULTI_SYSTEM_KRS);

    // Click ServiceA — it belongs to SysA. The breadcrumb should reflect
    // the system id as the first segment, not the other system.
    await page.locator('svg [data-node-id="ServiceA"]').first().click();

    const breadcrumb = page.locator(".breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("SysA");
    await expect(breadcrumb).toContainText("ServiceA");
    await expect(breadcrumb).not.toContainText("SysB");
  });

  test("reload restores the drilled service from the hash (AC5)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "drill", name: "Drill", files: { "index.krs": DRILL_KRS } }],
      lastProjectId: "drill",
    });
    await opfs.gotoApp();

    await drillInto(page, ["ECommerce"], { expectBreadcrumb: true });
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(hashToken("ECommerce"));

    await page.reload();

    // The reload re-reads the project from OPFS and re-resolves the hash's
    // node id through the path index (effect ② in useHistoryNavigation), so
    // the service view comes back rather than the system root.
    await expect(page.locator(".breadcrumb-current")).toHaveText("ECommerce");
    await expect(page.locator('svg [data-node-id="Ordering"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(hashToken("ECommerce"));
  });

  test("browser back and forward walk the drill levels (AC6)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "drill", name: "Drill", files: { "index.krs": DRILL_KRS } }],
      lastProjectId: "drill",
    });
    await opfs.gotoApp();

    const current = page.locator(".breadcrumb-current");
    const hash = () => page.evaluate(() => location.hash);

    // Wait for the root view so the first drill pushes on top of the initial
    // (replaced) root entry instead of racing the project load.
    await expect(page.locator('svg [data-node-id="ECommerce"]')).toBeVisible();
    await expect.poll(hash).toMatch(/^#krs-system-root(?:[:?]|$)/);

    await drillInto(page, ["ECommerce", "Ordering"], { expectBreadcrumb: true });
    await expect.poll(hash).toMatch(hashToken("Ordering"));

    await page.goBack();
    await expect(current).toHaveText("ECommerce");
    await expect.poll(hash).toMatch(hashToken("ECommerce"));

    // At the root the breadcrumb is the system alone.
    await page.goBack();
    await expect(current).toHaveText("ECPlatform");
    await expect(page.locator('svg [data-node-id="ECommerce"]')).toBeVisible();
    await expect.poll(hash).toMatch(/^#krs-system-root(?:[:?]|$)/);

    await page.goForward();
    await expect(current).toHaveText("ECommerce");
    await expect.poll(hash).toMatch(hashToken("ECommerce"));

    await page.goForward();
    await expect(current).toHaveText("Ordering");
    await expect(page.locator('svg [data-node-id="PlaceOrder"]')).toBeVisible();
  });
});
