import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { drillInto, nodeLocator } from "../fixtures/drill.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-3794: a usecase's `resource <ClientId>.<Id>` reaches the storage the
 * client declares with that id. The unit tests build each surface from a
 * parsed file; this spec drives the whole path in the app: Monaco → compile →
 * the domain view's promoted resource, the detail panel and the CRUD tab.
 */

const KRS = `system Studio {
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource localStorage Theme "karasu-theme"
  }
  service App {
    delivers WebApp
    domain Chat {
      usecase SaveApiKey {
        resource WebApp.ApiKey { operations create, update }
      }
    }
  }
}
`;

const panel = (page: Page) => page.locator(".node-detail-panel");

test.describe("AT-3794 client storage reference", () => {
  test("the domain view draws the reference as <name> (<storageKind>) and the panel names the client (AT-A)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);
    await drillInto(page, ["App", "Chat"]);

    const resource = nodeLocator(page, "WebApp.ApiKey");
    await expect(resource).toBeVisible();
    await expect(resource).toContainText("karasu.ai.anthropic.apiKey (sessionStorage)");

    // A leaf node opens its detail panel on a body click.
    await resource.click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator(".node-detail-client-storage")).toHaveText(
      'sessionStorage "karasu.ai.anthropic.apiKey" of client WebApp',
    );
  });

  test("the client's panel lists each storage id with the usecases that reference it (AT-B)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);
    await nodeLocator(page, "WebApp").click();
    await expect(panel(page)).toBeVisible();

    const items = page.locator(".node-detail-resource-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator(".node-detail-resource-id")).toHaveText("ApiKey");
    await expect(items.nth(0).locator(".node-detail-resource-usecases")).toHaveText(
      "used by SaveApiKey",
    );
    await expect(items.nth(1).locator(".node-detail-resource-id")).toHaveText("Theme");
    await expect(items.nth(1).locator(".node-detail-resource-usecases")).toHaveCount(0);
  });

  test("the CRUD tab has a column per identified client storage (AT-C)", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    await openViewTab(page, "CRUD");
    const table = page.locator(".crud-matrix-panel table");
    await expect(table).toBeVisible();

    const header = table.locator("tr").first();
    await expect(header).toContainText("karasu.ai.anthropic.apiKey (sessionStorage)");
    await expect(header).toContainText("karasu-theme (localStorage)");
    await expect(table.locator("tr", { hasText: "SaveApiKey" })).toContainText("CU");
  });
});
