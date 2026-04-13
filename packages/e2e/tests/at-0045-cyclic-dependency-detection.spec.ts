import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0045: Cyclic dependency detection and rendering.
 *
 * Covers the deterministic parts of the AT:
 *  - A sync cycle emits a `Circular dependency` warning
 *  - At least one cyclic edge in the rendered SVG carries the
 *    `krs-edge--cyclic` class
 *  - An async-only cycle emits no cyclic warning
 *
 * Out of scope:
 *  - Color / stroke width inspection — handled by AI visual review
 *  - User style override — needs a multi-file fixture (#534)
 */

const SYNC_CYCLE_KRS = `system ECommerce {
  service OrderService {}
  service PaymentService {}
  service InventoryService {}

  OrderService -> PaymentService
  PaymentService -> OrderService
  OrderService -> InventoryService
}
`;

const ASYNC_CYCLE_KRS = `system ECommerce {
  service OrderService {}
  service PaymentService {}

  OrderService --> PaymentService
  PaymentService --> OrderService
}
`;

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0045 Cyclic dependency detection", () => {
  test("sync cycle emits warning and marks edges with krs-edge--cyclic", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, SYNC_CYCLE_KRS);

    // Warning panel surfaces the circular dependency message.
    const warningPanel = page.locator(".warning-panel");
    await expect(warningPanel).toBeVisible();
    await expect(warningPanel).toContainText(/Circular dependency/);
    await expect(warningPanel).toContainText("OrderService");
    await expect(warningPanel).toContainText("PaymentService");

    // Rendered SVG has at least one edge element flagged as cyclic.
    const cyclicEdges = page.locator("svg .krs-edge--cyclic");
    await expect(cyclicEdges.first()).toBeAttached();
    expect(await cyclicEdges.count()).toBeGreaterThanOrEqual(2);
  });

  test("async-only cycle does not emit a cyclic-dependency warning", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ASYNC_CYCLE_KRS);

    // Either the warning panel is absent entirely, or it does not mention
    // a circular dependency. We wait a beat to let the preview re-render.
    await page.waitForTimeout(500);
    const warningPanel = page.locator(".warning-panel");
    const panelCount = await warningPanel.count();
    if (panelCount > 0) {
      await expect(warningPanel).not.toContainText(/Circular dependency/);
    }
    await expect(page.locator("svg .krs-edge--cyclic")).toHaveCount(0);
  });
});
