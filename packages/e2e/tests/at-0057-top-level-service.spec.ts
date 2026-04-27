import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0057: Top-level service declarations.
 *
 * Verifies top-level `service` parsing, the unassigned-service warning,
 * rendering alongside top-level domains and system children, and the
 * zero-system case where only orphan nodes exist.
 */

const TOP_LEVEL_SERVICE_KRS = `service AuthStandalone { label "認証" }
domain Payment { label "決済" }

system ECPlatform {
  service ECommerce {
    label "ECサイト"
  }
}
`;

const ZERO_SYSTEM_KRS = `service ECommerce {
  usecase ManageOrders { label "注文管理" }
}
`;

const SERVICE_INSIDE_SYSTEM_KRS = `system ECPlatform {
  service ECommerce { label "ECサイト" }
}
`;

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0057 Top-level service declarations", () => {
  test("top-level services render and emit unassigned warnings (TC-1, TC-2)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, TOP_LEVEL_SERVICE_KRS);

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("ECサイト");
    await expect(preview).toContainText("認証");
    await expect(preview).toContainText("決済");

    const warningPanel = page.locator(".warning-panel");
    await expect(warningPanel).toBeVisible();
    await expect(warningPanel).toContainText(/認証.*not assigned to any system/);
  });

  test("zero-system file renders orphan service drill-down (TC-3)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ZERO_SYSTEM_KRS);

    // Make sure we are on the System tab — auto-switch hooks (#766/#844)
    // can run during the seed → empty → ZERO_SYSTEM transition and leave the
    // active tab somewhere other than System.
    await page.getByRole("tab", { name: "System" }).click();
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).not.toContainText("No diagram");
    await expect(preview).toContainText("ECommerce");
  });

  test("services nested inside a system do not emit unassigned warnings (TC-4)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, SERVICE_INSIDE_SYSTEM_KRS);

    await page.waitForTimeout(500);
    const warningPanel = page.locator(".warning-panel");
    if ((await warningPanel.count()) > 0) {
      await expect(warningPanel).not.toContainText(/not assigned to any system/);
    }
  });
});
