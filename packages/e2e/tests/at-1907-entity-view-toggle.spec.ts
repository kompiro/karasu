import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

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
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);

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
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
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
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
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
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
    await drillIntoOrderingDomain(page);
    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/-entity\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain('data-node-id="Order"');
    expect(content).toContain('data-node-id="LineItem"');
  });

  // The entity member can only be grouped via the `boundary` axis: `owns`
  // (team axis) never indexes entities (service/domain/client + top-level
  // infra only), and `contains` has no kind restriction. The boundary axis
  // reaching this surface at all is the #2033 fix — AppShell used to hardcode
  // the team axis when calling `useViewSvg`, dropping "boundary" before it
  // reached the entity view and the export builders.
  test("Group by: boundary frames an entity member in the entity view (#1983)", async ({
    page,
    opfs,
  }) => {
    const ENTITY_BOUNDARY_KRS = `${ENTITY_KRS}
boundary core_data "Core data" {
  contains Order
}
`;
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_BOUNDARY_KRS);
    await drillIntoOrderingDomain(page);

    // Pick the boundary axis on the drilled (usecase) view, then flip to the
    // entity sub-mode — Group-by is view-state and must survive the toggle.
    await page.locator("#group-by-select").selectOption("boundary");
    await entityToggle(page).click();

    const entityPane = page.locator(".preview-pane--entity");
    await expect(entityPane).toBeVisible();
    await expect(entityPane.locator('[data-node-id="Order"]')).toBeVisible();
    // The contained entity gets its boundary frame; the non-member stays out.
    await expect(entityPane.locator('[data-container-id="__group_core_data__"]')).toBeVisible();
    await expect(entityPane.locator('[data-node-id="LineItem"]')).toBeVisible();
  });
});
