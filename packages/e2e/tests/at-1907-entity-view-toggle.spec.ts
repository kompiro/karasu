import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { clickAndDownload, readDownloadText } from "../fixtures/download.js";

/**
 * AT-1907: Entity view app integration (PR 2b-1).
 *
 * Covers the deterministic DOM/URL-observable parts of the AT:
 *  - The "Entities" toggle appears only when drilled into a domain that owns
 *    entities (system view sub-mode, not a top-level tab)
 *  - Activating it renders the domain's entities + intra-domain relation and
 *    excludes usecases
 *  - The URL hash reflects the entity sub-mode as `#krs-entity-<domainId>`
 *  - Deactivating restores the usecase view
 *  - SVG export in entity mode uses the `-entity.svg` filename
 *
 * Out of scope (unit-tested): buildHash/parseHash round-trip and share-payload
 * `entityView` flag (packages/app useHistoryNavigation.test / inline-share.test),
 * and the core slice/render (packages/core renderEntityView tests).
 */

const ENTITY_KRS = `system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {}
      entity Order {
        Order -> LineItem "has"
      }
      entity LineItem {}
    }
  }
}
`;

async function drillIntoOrderingDomain(page: Page) {
  await page.locator('svg [data-node-id="OrderService"]').first().click();
  await page.locator('svg [data-node-id="Ordering"]').first().click();
}

const entityToggle = (page: Page) => page.getByRole("button", { name: "Toggle entity view" });

test.describe("AT-1907 Entity view app integration", () => {
  test("Entities toggle appears only when drilled into a domain with entities", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ENTITY_KRS);

    // At the system root there is no drilled domain → no toggle.
    await expect(entityToggle(page)).toHaveCount(0);

    // Drill into the service — still not a domain → no toggle.
    await page.locator('svg [data-node-id="OrderService"]').first().click();
    await expect(entityToggle(page)).toHaveCount(0);

    // Drill into the domain that owns entities → toggle appears.
    await page.locator('svg [data-node-id="Ordering"]').first().click();
    await expect(entityToggle(page)).toBeVisible();
  });

  test("Activating the entity view renders entities + relation, excludes usecases, and sets the hash", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ENTITY_KRS);
    await drillIntoOrderingDomain(page);

    // Usecase view first: PlaceOrder is shown, entities are not.
    await expect(page.locator('svg [data-node-id="PlaceOrder"]').first()).toBeVisible();

    await entityToggle(page).click();
    await expect(entityToggle(page)).toHaveAttribute("aria-pressed", "true");

    const entityPane = page.locator(".preview-pane--entity");
    await expect(entityPane).toBeVisible();
    await expect(entityPane.locator('[data-node-id="Order"]')).toBeVisible();
    await expect(entityPane.locator('[data-node-id="LineItem"]')).toBeVisible();
    // Usecases do not appear in the entity view.
    await expect(entityPane.locator('[data-node-id="PlaceOrder"]')).toHaveCount(0);

    // The URL hash reflects the entity sub-mode, keyed by the domain id. The
    // `?file=` suffix (persisted open file, Issue #811) may follow it.
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#krs-entity-Ordering(\?file=|$)/);
  });

  test("Deactivating the entity view restores the usecase view", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, ENTITY_KRS);
    await drillIntoOrderingDomain(page);

    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();

    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toHaveCount(0);
    await expect(page.locator('svg [data-node-id="PlaceOrder"]').first()).toBeVisible();
  });

  test("Export SVG in entity mode uses the `-entity.svg` filename with entity nodes embedded", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ENTITY_KRS);
    await drillIntoOrderingDomain(page);
    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();

    const download = await clickAndDownload(page.getByRole("button", { name: "Export SVG" }));

    expect(download.suggestedFilename()).toMatch(/-entity\.svg$/);

    const content = await readDownloadText(download);
    expect(content).toContain("<svg");
    expect(content).toContain('data-node-id="Order"');
    expect(content).toContain('data-node-id="LineItem"');
  });
});
