import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0046: System ID in ViewPath for multi-system navigation.
 *
 * Covers AC1 (single-system breadcrumb) and AC2 (multi-system
 * drill-down picks the correct system). AC3 is automated by parser
 * unit tests, AC4 is VS Code specific, and AC5 (hash reload) is
 * deferred until the hash navigation helper lands (#534).
 */

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

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0046 System ID in ViewPath", () => {
  test("single-system breadcrumb includes the system label and restores root on click (AC1)", async ({
    page,
  }) => {
    await page.goto("/");

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
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, MULTI_SYSTEM_KRS);

    // Click ServiceA — it belongs to SysA. The breadcrumb should reflect
    // the system id as the first segment, not the other system.
    await page.locator('svg [data-node-id="ServiceA"]').first().click();

    const breadcrumb = page.locator(".breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("SysA");
    await expect(breadcrumb).toContainText("ServiceA");
    await expect(breadcrumb).not.toContainText("SysB");
  });
});
